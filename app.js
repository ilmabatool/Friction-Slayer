require('dotenv').config();
const express = require('express'), path = require('path');
const { analyzeHicksLaw }      = require('./services/scraper');
const { calculateLeak }        = require('./utils/leak_calc');
const { upsertLead, sendInitialScareEmail, startLeadCron, getPageSpeedMetrics } = require('./services/outreach');

const app = express(), PORT = process.env.PORT || 3000;
app.use(express.json(), express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

app.get('/',      (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/audit', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'audit.html')));

// ─── Analysis Route: Returns JSON for the Luxury Terminal UI ────────────────
app.post('/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required.' });

    // 1. Run Intelligence Scans
    const [hicks, cwv] = await Promise.all([
      analyzeHicksLaw(url),
      getPageSpeedMetrics(url),
    ]);

    // 2. Quantify Revenue Leak
    const { annualLeak, monthlyExposure, dailyLoss } = calculateLeak({ 
      lcp: cwv.lcp, 
      inp: cwv.inp,
      elements: hicks.total 
    });

    const isParalysis = hicks.verdict === 'Decision Paralysis';
    const hicksScore  = isParalysis ? "High Friction" : "Optimized";

    // 3. Return Intelligence Payload
    res.json({
      siteUrl:         url,
      annualLeak,
      monthlyExposure,
      dailyLoss,
      lcp:             cwv.lcp,
      inp:             cwv.inp,
      hicksVerdict:    hicks.verdict,
      hicksScore,
      hicksMessage:    hicks.message,
      hicksTotal:      hicks.total,
    });
  } catch (err) {
    console.error('[analyze] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ─── Lead Capture: save contact + fire scare email ───────────────────────────
app.post('/outreach', async (req, res) => {
  try {
    const { email, leakAmount = 83, siteUrl = '' } = req.body;

    // Basic email format guard
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    const dailyLeak   = Number(leakAmount) || 83;
    const annualLeak  = dailyLeak * 365;
    const monthlyLeak = dailyLeak * 30;

    // Persist to leads.json
    upsertLead(email, siteUrl, dailyLeak, monthlyLeak);

    // Fire initial scare email (non-blocking)
    sendInitialScareEmail(email, annualLeak, siteUrl).catch(err =>
      console.error('[outreach] Initial email failed:', err.message)
    );

    res.json({ success: true, message: 'Lead saved. Scare email queued.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Reply webhook: mark lead as replied ─────────────────────────────────────
app.post('/webhook/reply', express.json(), (req, res) => {
  try {
    const email = req.body?.from || req.body?.email;
    if (!email) return res.status(400).json({ error: 'Missing email.' });
    const fs    = require('fs');
    const leads = JSON.parse(fs.existsSync('./leads.json')
      ? fs.readFileSync('./leads.json', 'utf8') : '[]');
    const lead  = leads.find(l => l.email === email);
    if (lead) {
      lead.replyTracked = true;
      lead.repliedAt    = new Date().toISOString();
      fs.writeFileSync('./leads.json', JSON.stringify(leads, null, 2));
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start cron + server ─────────────────────────────────────────────────────
startLeadCron();
app.listen(PORT, () => console.log(`Friction-Slayer live on http://localhost:${PORT}`));
