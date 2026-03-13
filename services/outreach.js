const axios = require('axios');
require('dotenv').config();

/**
 * FETCH REAL METRICS FROM GOOGLE V8 ENGINE
 * This is the foundation of the 'Truth at all costs' directive.
 */
async function getAuthenticMetrics(url) {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;AIzaSyCs0N4YDTZJewo5MfytDuCQD4g5iYnjQ-Q
  // Ensure the URL is clean
  const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
  const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(cleanUrl)}&key=${apiKey}&strategy=mobile`;

  try {
    const response = await axios.get(psiUrl);
    const audits = response.data.lighthouseResult.audits;
    
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
    console.error("CRITICAL ERROR: Authenticity Pipeline Failure.", error.message);
    throw new Error("Could not verify metrics. Check API Key and URL.");
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