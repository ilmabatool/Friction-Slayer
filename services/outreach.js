const axios = require('axios');
require('dotenv').config();

/**
 * FETCH REAL METRICS FROM GOOGLE V8 ENGINE
 * This is the foundation of the 'Truth at all costs' directive.
 */
async function getAuthenticMetrics(url) {
  const apiKey = (process.env.GOOGLE_PAGESPEED_API_KEY || process.env.PAGESPEED_API_KEY || '')
    .trim()
    .replace(/;$/, '');
  if (!apiKey) {
    throw new Error('Google API key missing. Set GOOGLE_PAGESPEED_API_KEY in .env');
  }

  // Ensure the URL is clean
  const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
  const params = new URLSearchParams({
    url: cleanUrl,
    key: apiKey,
    strategy: 'mobile'
  });
  const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;

  try {
    const response = await axios.get(psiUrl);
    const audits = response.data?.lighthouseResult?.audits;
    if (!audits?.['largest-contentful-paint'] || !audits?.['interactive']) {
      throw new Error('[Google PSI] Response missing expected Lighthouse metrics.');
    }
    
    // Key Performance Indicators (KPIs)
    const lcp = audits['largest-contentful-paint'].numericValue / 1000; // in seconds
    const tti = audits['interactive'].numericValue; // in milliseconds
    const cls = parseFloat(audits['cumulative-layout-shift'].displayValue);

    return {
      lcp: parseFloat(lcp.toFixed(2)),
      tti: Math.round(tti),
      cls: cls,
      isAuthentic: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const status = error.response?.status;
    const apiMessage = error.response?.data?.error?.message || error.message;
    const apiReason = error.response?.data?.error?.errors?.[0]?.reason;
    const detail = apiReason
      ? `[Google PSI ${status || 'UNKNOWN'}] ${apiMessage} (reason: ${apiReason})`
      : `[Google PSI ${status || 'UNKNOWN'}] ${apiMessage}`;

    console.error('CRITICAL ERROR: Authenticity Pipeline Failure.', detail);
    throw new Error(detail);
  }
}

/**
 * CALCULATE REVENUE LEAK BASED ON PSYCHOLOGICAL FRICTION
 */
function calculateLeak(metrics, traffic = 5000, aov = 500) {
  // Penalties based on industry standard 'Loss Aversion' data
  const lcpPenalty = metrics.lcp > 2.5 ? (metrics.lcp - 2.5) * 0.1 : 0;
  const ttiPenalty = metrics.tti > 3000 ? (metrics.tti - 3000) / 1000 * 0.05 : 0;
  
  const totalPenalty = lcpPenalty + ttiPenalty;
  const annualLeak = (traffic * 0.02 * aov * 12) * totalPenalty;

  return {
    annualLoss: Math.round(annualLeak),
    lcpLoss: Math.round(annualLeak * 0.6),
    ttiLoss: Math.round(annualLeak * 0.4),
    formula: "Leak = (Traffic * CR * AOV) * (Latency_Penalty)"
  };
}

module.exports = { getAuthenticMetrics, calculateLeak };