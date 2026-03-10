require('dotenv').config();
const express = require('express'), path = require('path');
const { analyzeHicksLaw }      = require('./services/scraper');
const { calculateRevenueLeak } = require('./utils/neuromarketing');
const { upsertLead, sendInitialScareEmail, startLeadCron } = require('./services/outreach');

const app = express(), PORT = process.env.PORT || 3000;
app.use(express.json(), express.urlencoded({ extended: true }), express.static(path.join(__dirname)));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    const hicks   = await analyzeHicksLaw(url);
    // LCP 3.0s (>2.5s threshold) and INP 250ms (>200ms threshold) are conservative
    // defaults representing a typical underperforming site. Swap for real CWV data
    // from a PageSpeed Insights API call when PAGESPEED_API_KEY is available.
    const revenue = calculateRevenueLeak(3.0, 250); // uses $500 product / 2% CVR baseline

    // Sanitize user-supplied URL for safe HTML embedding
    const escUrl           = String(url).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const annualLeak       = revenue.monthlyLeak * 12;
    const annualFormatted  = annualLeak.toLocaleString();
    const monthlyFormatted = revenue.monthlyLeak.toLocaleString();
    const dailyLeak        = revenue.leakAmount;
    const isParalysis      = hicks.verdict === 'Decision Paralysis';
    const fScore           = isParalysis ? 87 : 22;
    const fSeverity        = isParalysis ? 'CRITICAL' : 'LOW RISK';
    const fColor           = isParalysis ? '#ef4444' : '#22c55e';
    const fBg              = isParalysis ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)';
    const fBorder          = isParalysis ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)';
    const fLabel           = isParalysis ? "Hick\u2019s Law Violation \u2014 Decision Paralysis" : "Navigation Architecture \u2014 Within Threshold";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Executive Audit &middot; Qaseem.pk</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      background: #050505;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      min-height: 100vh;
      opacity: 0;
      animation: dashIn 0.55s ease 0.05s forwards;
    }
    @keyframes dashIn { to { opacity: 1; } }

    /* ── TOP NAV ── */
    .top-nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      height: 50px;
      background: rgba(5,5,5,0.9);
      border-bottom: 1px solid rgba(255,255,255,0.055);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 1.75rem;
    }
    .nav-brand {
      font-size: 0.6rem; letter-spacing: 0.22em;
      text-transform: uppercase; color: rgba(255,255,255,0.25); font-weight: 700;
    }
    .nav-center {
      position: absolute; left: 50%; transform: translateX(-50%);
      font-size: 0.58rem; letter-spacing: 0.16em;
      text-transform: uppercase; color: rgba(255,255,255,0.13);
    }
    .nav-badge {
      font-size: 0.55rem; letter-spacing: 0.13em; text-transform: uppercase;
      background: rgba(239,68,68,0.1); color: rgba(239,68,68,0.7);
      border: 1px solid rgba(239,68,68,0.2);
      padding: 0.22rem 0.65rem; border-radius: 4px;
    }

    /* ── MAIN ── */
    .main {
      max-width: 1080px;
      margin: 0 auto;
      padding: 74px 1.75rem 5rem;
    }

    /* ── EXEC HEADER ── */
    .exec-header {
      padding: 2.5rem 0 2rem;
      border-bottom: 1px solid rgba(255,255,255,0.055);
      margin-bottom: 1.75rem;
    }
    .exec-url {
      font-size: 0.6rem; letter-spacing: 0.18em; text-transform: uppercase;
      color: rgba(255,255,255,0.16); margin-bottom: 1rem;
    }
    .exec-url span { color: rgba(255,255,255,0.35); }
    .exec-h1 {
      font-size: clamp(1.8rem, 4vw, 2.6rem);
      font-weight: 900; line-height: 1.1; letter-spacing: -0.025em; margin-bottom: 1.1rem;
    }
    .exec-h1 .red-grad {
      background: linear-gradient(135deg, #ff3030, #dc2626);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .risk-badge {
      display: inline-flex; align-items: center; gap: 0.5rem;
      background: rgba(239,68,68,0.1); color: #ef4444;
      border: 1px solid rgba(239,68,68,0.25);
      font-size: 0.6rem; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase;
      padding: 0.35rem 0.85rem; border-radius: 5px;
    }
    .risk-pulse {
      width: 6px; height: 6px; border-radius: 50%; background: #ef4444;
      animation: pulse 1.4s ease-in-out infinite;
    }
    @keyframes pulse {
      0%,100% { box-shadow: 0 0 0 0   rgba(239,68,68,0.6); }
      50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0);   }
    }

    /* ── KPI GRID ── */
    .kpi-grid {
      display: grid;
      grid-template-columns: 1.5fr 1fr 1fr;
      gap: 1px;
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.055);
      border-radius: 14px; overflow: hidden;
      margin-bottom: 1.5rem;
    }
    @media (max-width: 600px) { .kpi-grid { grid-template-columns: 1fr; } }
    .kpi-card {
      background: #050505; padding: 2rem 1.75rem;
      display: flex; flex-direction: column;
    }
    .kpi-card.primary { background: #070707; }
    .kpi-label {
      font-size: 0.58rem; letter-spacing: 0.2em; text-transform: uppercase;
      color: rgba(255,255,255,0.2); margin-bottom: 1rem;
    }
    .kpi-value {
      font-size: clamp(2.8rem, 7vw, 4.2rem);
      font-weight: 900; line-height: 1; letter-spacing: -0.03em;
      color: #ef4444; text-shadow: 0 0 60px rgba(239,68,68,0.32);
    }
    .kpi-value.sm { font-size: clamp(2rem, 5vw, 2.9rem); text-shadow: 0 0 40px rgba(239,68,68,0.22); }
    .kpi-sub { font-size: 0.68rem; color: rgba(255,255,255,0.14); margin-top: 0.6rem; letter-spacing: 0.04em; }
    .kpi-tagline { font-size: 0.8rem; color: rgba(255,255,255,0.32); margin-top: 0.65rem; line-height: 1.55; }
    .kpi-tagline strong { color: rgba(255,255,255,0.6); }

    /* ── ANALYSIS GRID ── */
    .analysis-grid {
      display: grid;
      grid-template-columns: 1.05fr 0.95fr;
      gap: 1px;
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.055);
      border-radius: 14px; overflow: hidden;
      margin-bottom: 1.5rem;
    }
    @media (max-width: 680px) { .analysis-grid { grid-template-columns: 1fr; } }
    .a-panel { background: #050505; padding: 1.75rem; }
    .a-panel.alt { background: #060606; }
    .panel-label {
      font-size: 0.58rem; letter-spacing: 0.2em; text-transform: uppercase;
      color: rgba(255,255,255,0.18); margin-bottom: 1.25rem;
    }

    /* Hick's Law panel */
    .score-row { display: flex; align-items: flex-end; gap: 0.5rem; margin-bottom: 1.2rem; }
    .score-num {
      font-size: 4rem; font-weight: 900; line-height: 1; letter-spacing: -0.04em;
    }
    .score-denom { font-size: 1rem; color: rgba(255,255,255,0.2); margin-bottom: 0.45rem; }
    .score-sev {
      font-size: 0.58rem; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase;
      padding: 0.25rem 0.65rem; border-radius: 4px; margin-bottom: 0.45rem; margin-left: auto; align-self: flex-start;
    }
    .score-track {
      height: 4px; background: rgba(255,255,255,0.06);
      border-radius: 4px; overflow: hidden; margin-bottom: 1rem;
    }
    .score-fill { height: 100%; border-radius: 4px; transition: width 1.4s cubic-bezier(0.4,0,0.2,1); }
    .friction-verdict { font-size: 0.82rem; font-weight: 700; color: rgba(255,255,255,0.65); margin-bottom: 0.5rem; }
    .friction-msg { font-size: 0.78rem; color: rgba(255,255,255,0.28); line-height: 1.7; }

    /* Revenue model panel */
    .rev-row {
      display: flex; align-items: flex-start; gap: 0.75rem;
      padding: 0.9rem 0; border-bottom: 1px solid rgba(255,255,255,0.045);
    }
    .rev-row:last-child { border-bottom: none; }
    .rev-icon {
      font-size: 0.72rem; background: rgba(255,255,255,0.04);
      border-radius: 6px; padding: 0.35rem 0.45rem; flex-shrink: 0; margin-top: 0.1rem;
    }
    .rev-lbl { font-size: 0.78rem; font-weight: 700; color: rgba(255,255,255,0.58); margin-bottom: 0.2rem; }
    .rev-detail { font-size: 0.72rem; color: rgba(255,255,255,0.24); line-height: 1.65; }

    /* ── ACTION PLAN ── */
    .action-wrap {
      border: 1px solid rgba(255,255,255,0.055);
      border-radius: 14px; overflow: hidden; margin-bottom: 1.5rem;
    }
    .action-head {
      background: #070707; padding: 1.25rem 1.75rem;
      border-bottom: 1px solid rgba(255,255,255,0.055);
    }
    .section-label {
      font-size: 0.58rem; letter-spacing: 0.2em; text-transform: uppercase;
      color: rgba(255,255,255,0.18); margin-bottom: 0.6rem;
    }
    .action-desc { font-size: 0.84rem; color: rgba(255,255,255,0.3); line-height: 1.65; }
    .action-body { padding: 1.5rem 1.75rem; }
    .price-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.85rem 1rem; border-radius: 8px; margin-bottom: 0.5rem;
    }
    .price-lbl { font-size: 0.85rem; color: rgba(255,255,255,0.32); }
    .price-val { font-size: 0.95rem; font-weight: 700; color: rgba(255,255,255,0.18); text-decoration: line-through; }
    .price-row.sub .price-lbl { color: rgba(255,255,255,0.28); }
    .price-row.sub .price-val { color: rgba(239,68,68,0.45); text-decoration: none; font-size: 0.9rem; }
    .divider { height: 1px; background: rgba(255,255,255,0.045); margin: 0.75rem 0; }
    .price-row.total {
      background: rgba(34,211,238,0.05);
      border: 1px solid rgba(34,211,238,0.18);
      margin-top: 0.75rem; margin-bottom: 0;
    }
    .price-row.total .price-lbl { color: #fff; font-weight: 700; font-size: 0.9rem; }
    .price-row.total .price-val { color: #22d3ee; font-size: 1.35rem; text-decoration: none; }

    /* ── CTA ── */
    .cta-wrap {
      border: 1px solid rgba(255,255,255,0.055);
      border-radius: 14px; overflow: hidden;
    }
    .cta-inner { padding: 2rem 1.75rem 1.5rem; }
    .cta-btn {
      display: block; width: 100%;
      padding: 1.1rem 1.5rem; border-radius: 10px;
      background: #22d3ee; color: #000;
      font-weight: 900; font-size: 0.88rem;
      letter-spacing: 0.07em; text-transform: uppercase;
      text-align: center; text-decoration: none;
      box-shadow: 0 0 50px rgba(34,211,238,0.45), 0 0 100px rgba(34,211,238,0.15);
      transition: background 0.2s, box-shadow 0.2s;
      margin-bottom: 0.75rem;
    }
    .cta-btn:hover {
      background: #67e8f9;
      box-shadow: 0 0 70px rgba(34,211,238,0.6), 0 0 140px rgba(34,211,238,0.22);
    }
    .cta-sub {
      text-align: center; font-size: 0.62rem;
      color: rgba(255,255,255,0.13); letter-spacing: 0.06em; text-transform: uppercase;
    }
    .cd-footer {
      background: #070707; padding: 1rem 1.75rem;
      border-top: 1px solid rgba(255,255,255,0.05);
      display: flex; align-items: center; justify-content: space-between;
    }
    .cd-lbl { font-size: 0.6rem; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.18); }
    .cd-timer {
      font-size: 1.25rem; font-weight: 900; color: #f87171;
      letter-spacing: 0.1em; font-variant-numeric: tabular-nums;
    }
  </style>
</head>
<body>

  <!-- TOP NAV -->
  <nav class="top-nav">
    <span class="nav-brand">Qaseem.pk</span>
    <span class="nav-center">Executive Audit &mdash; Confidential</span>
    <span class="nav-badge">Risk Level: Critical</span>
  </nav>

  <div class="main">

    <!-- EXEC HEADER -->
    <section class="exec-header">
      <p class="exec-url">Site Analyzed: <span>${escUrl}</span></p>
      <h1 class="exec-h1">
        Executive Summary:<br/>
        <span class="red-grad">Revenue Leak Confirmed.</span>
      </h1>
      <div class="risk-badge"><span class="risk-pulse"></span> Risk Level: Critical</div>
    </section>

    <!-- KPI GRID -->
    <div class="kpi-grid">
      <div class="kpi-card primary">
        <p class="kpi-label">Annual Revenue Leak</p>
        <p class="kpi-value">$${annualFormatted}</p>
        <p class="kpi-tagline">That is <strong>$${dailyLeak}</strong> walking out the door every single day.</p>
      </div>
      <div class="kpi-card">
        <p class="kpi-label">Monthly Exposure</p>
        <p class="kpi-value sm">$${monthlyFormatted}</p>
        <p class="kpi-sub">per 30 days</p>
      </div>
      <div class="kpi-card">
        <p class="kpi-label">Daily Loss</p>
        <p class="kpi-value sm">$${dailyLeak}</p>
        <p class="kpi-sub">every day this goes unfixed</p>
      </div>
    </div>

    <!-- ANALYSIS GRID -->
    <div class="analysis-grid">
      <!-- Hick's Law Panel -->
      <div class="a-panel">
        <p class="panel-label">Hick&rsquo;s Law Analysis &mdash; Friction Load</p>
        <div class="score-row">
          <p class="score-num" style="color:${fColor};text-shadow:0 0 55px ${fColor}88;">${fScore}</p>
          <p class="score-denom">/ 100</p>
          <span class="score-sev" style="background:${fBg};color:${fColor};border:1px solid ${fBorder};">${fSeverity}</span>
        </div>
        <div class="score-track">
          <div class="score-fill" id="score-bar" style="width:0%;background:${fColor};box-shadow:0 0 10px ${fColor}99;"></div>
        </div>
        <p class="friction-verdict">${fLabel}</p>
        <p class="friction-msg">${hicks.message}</p>
      </div>
      <!-- Revenue Model Panel -->
      <div class="a-panel alt">
        <p class="panel-label">Revenue Model &mdash; Exposure Breakdown</p>
        <div class="rev-row">
          <div class="rev-icon">📉</div>
          <div>
            <p class="rev-lbl">Performance Tax</p>
            <p class="rev-detail">LCP &gt; 2.5 s adds a 15% revenue penalty per Google research. Every second of load delay compounds abandonment.</p>
          </div>
        </div>
        <div class="rev-row">
          <div class="rev-icon">🧠</div>
          <div>
            <p class="rev-lbl">Cognitive Overload</p>
            <p class="rev-detail">INP &gt; 200 ms creates a 10% revenue drag. Sluggish interactions break decision momentum at the critical moment.</p>
          </div>
        </div>
        <div class="rev-row">
          <div class="rev-icon">⚠️</div>
          <div>
            <p class="rev-lbl">Compounding Exposure</p>
            <p class="rev-detail">${revenue.lossAversionMessage}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ACTION PLAN -->
    <div class="action-wrap">
      <div class="action-head">
        <p class="section-label">Action Plan &mdash; Recommended Resolution</p>
        <p class="action-desc">We have identified the critical friction points. Below is the path to stopping the revenue bleed — and exactly what it costs you.</p>
      </div>
      <div class="action-body">
        <div class="price-row">
          <span class="price-lbl">Professional Agency Audit Fee</span>
          <span class="price-val">$2,000</span>
        </div>
        <div class="price-row sub">
          <span class="price-lbl">Agency Partner Subsidy</span>
          <span class="price-val">&minus; $2,000</span>
        </div>
        <div class="divider"></div>
        <div class="price-row total">
          <span class="price-lbl">Your Total Today</span>
          <span class="price-val">$0</span>
        </div>
      </div>
    </div>

    <!-- CTA + COUNTDOWN -->
    <div class="cta-wrap">
      <div class="cta-inner">
        <a href="mailto:hello@qaseem.pk?subject=Execute%20My%20Free%205-Minute%20Friction%20Fix&body=I%20ran%20the%20revenue%20audit%20and%20want%20to%20execute%20the%20free%205-minute%20friction%20fix."
          class="cta-btn">
          Execute 5-Minute Friction Fix &rarr;
        </a>
        <p class="cta-sub">No commitment &nbsp;&middot;&nbsp; No sales call &nbsp;&middot;&nbsp; One real fix delivered in 5 minutes</p>
      </div>
      <div class="cd-footer">
        <span class="cd-lbl">Offer expires in</span>
        <span class="cd-timer" id="offer-countdown">48:00:00</span>
      </div>
    </div>

  </div><!-- .main -->

  <script>
    // Animate the friction score bar after paint
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        var bar = document.getElementById('score-bar');
        if (bar) bar.style.width = '${fScore}%';
      });
    });

    // 48-hour countdown — persists in localStorage across page loads
    (function() {
      var KEY = 'qpk_audit_expiry_v1';
      var stored = localStorage.getItem(KEY);
      var expiry = stored ? parseInt(stored, 10) : NaN;
      if (isNaN(expiry) || expiry < Date.now()) {
        expiry = Date.now() + 48 * 3600 * 1000;
        localStorage.setItem(KEY, String(expiry));
      }
      function tick() {
        var el = document.getElementById('offer-countdown');
        if (!el) return;
        var diff = expiry - Date.now();
        if (diff <= 0) {
          el.textContent = 'EXPIRED';
          el.style.color = 'rgba(255,255,255,0.2)';
          return;
        }
        var hh = Math.floor(diff / 3600000);
        var mm = Math.floor((diff % 3600000) / 60000);
        var ss = Math.floor((diff % 60000) / 1000);
        el.textContent =
          (hh < 10 ? '0' : '') + hh + ':' +
          (mm < 10 ? '0' : '') + mm + ':' +
          (ss < 10 ? '0' : '') + ss;
        setTimeout(tick, 1000);
      }
      tick();
    })();
  </script>

</body>
</html>`;
    res.send(html);
  } catch (err) {
    res.status(500).send('<!DOCTYPE html><html><body style="background:#050505;color:#f87171;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-size:0.9rem;font-weight:700;"><p>Audit Error: ' + err.message.replace(/</g,'&lt;') + '</p></body></html>');
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

    const dailyLeak    = Number(leakAmount) || 83;
    const monthlyLeak  = dailyLeak * 30;

    // Persist to leads.json
    upsertLead(email, siteUrl, dailyLeak, monthlyLeak);

    // Fire initial scare email (non-blocking — don't let email failure block the response)
    sendInitialScareEmail(email, dailyLeak, siteUrl).catch(err =>
      console.error('[outreach] Initial email failed:', err.message)
    );

    res.json({ success: true, message: 'Lead saved. Scare email queued.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Reply webhook: mark lead as replied (call from Resend inbound webhook) ───
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

// ─── Start cron + server ──────────────────────────────────────────────────────
startLeadCron();
app.listen(PORT, () => console.log(`Friction-Slayer live on http://localhost:${PORT}`));
