require('dotenv').config();
const express = require('express'), path = require('path');
const axios = require('axios');
const { analyzeSite } = require('./services/analyzer');
const { calculateLeak } = require('./utils/leak_calc');

const app = express(), PORT = process.env.PORT || 3000;

app.use(express.json(), express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// ─── AUTHENTICITY ENGINE ──────────────────────────────────────────────────
async function getPageSpeedMetrics(url) {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!apiKey) throw new Error("API Key Missing. Add GOOGLE_PAGESPEED_API_KEY to .env");
  
  const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
  const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(cleanUrl)}&key=${apiKey}&strategy=mobile`;

  // Retries for 429 Errors
  let attempts = 0;
  while (attempts < 3) {
    try {
      const response = await axios.get(psiUrl);
      const audits = response.data.lighthouseResult.audits;
      return {
        lcp: audits['largest-contentful-paint'].numericValue / 1000,
        tti: audits['interactive'].numericValue,
        isAuthentic: true
      };
    } catch (error) {
      if (error.response?.status === 429) {
        attempts++;
        await new Promise(r => setTimeout(r, 2000 * attempts));
      } else throw error;
    }
  }
}

// ─── UPGRADED ANALYSIS ROUTE ──────────────────────────────────────────────
app.post('/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required.' });

    console.log(`[SYSTEM] Engaging Google V8 for: ${url}`);

    // Run deep site analysis and PageSpeed in parallel
    const [analysis, cwv] = await Promise.all([
      analyzeSite(url).catch(() => ({ status: 'ERROR', seo: null, hicks: null, neuromarketing: null, tech_stack: [] })),
      getPageSpeedMetrics(url)
    ]);

    // Quantify Revenue Leak with full breakdown
    const report = calculateLeak({
      lcp:            cwv.lcp,
      tti:            cwv.tti,
      seo:            analysis.seo,
      neuromarketing: analysis.neuromarketing,
    });

    res.json({
      success: true,
      url,
      metrics:  cwv,
      analysis,
      report,
      status: "VERIFIED_BY_GOOGLE"
    });

  } catch (err) {
    console.error('[SYSTEM ERROR]', err.message);
    res.status(500).json({ error: "Scan failed. Google is throttling or site is blocked." });
  }
});

app.get('/',      (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/audit', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'audit.html')));

app.listen(PORT, () => console.log(`[MERCENARY ACTIVE] Port ${PORT}`));