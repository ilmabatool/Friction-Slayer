const { get } = require('axios');
const { normalizeUrl } = require('../utils/helpers');
const { env } = require('../config/env');

async function getPageSpeedMetrics(url) {
  const apiKey = env.GOOGLE_PAGESPEED_API_KEY;
  if (!apiKey) throw new Error('API Key Missing. Add GOOGLE_PAGESPEED_API_KEY or PAGESPEED_API_KEY to .env');

  const cleanUrl = normalizeUrl(url);
  const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(cleanUrl)}&key=${apiKey}&strategy=mobile`;

  let attempts = 0;
  while (attempts < 3) {
    try {
      const response = await get(psiUrl, { timeout: 30000 });
      const result = response.data.lighthouseResult;
      const audits = result.audits;
      return {
        lcp: audits['largest-contentful-paint']?.numericValue
          ? Math.round((audits['largest-contentful-paint'].numericValue / 1000) * 100) / 100
          : null,
        fcp: audits['first-contentful-paint']?.numericValue
          ? Math.round((audits['first-contentful-paint'].numericValue / 1000) * 100) / 100
          : null,
        tti: audits.interactive?.numericValue || null,
        cls: audits['cumulative-layout-shift']?.numericValue ?? null,
        speedIndex: audits['speed-index']?.numericValue
          ? Math.round((audits['speed-index'].numericValue / 1000) * 100) / 100
          : null,
        performanceScore: Math.round((result.categories.performance.score || 0) * 100),
        isAuthentic: true
      };
    } catch (error) {
      if (error.response?.status === 429) {
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
      } else {
        const upstreamMsg = error.response?.data?.error?.message;
        throw new Error(upstreamMsg || error.message || 'PageSpeed request failed');
      }
    }
  }

  throw new Error('PageSpeed API failed after retries (rate-limited).');
}

module.exports = { getPageSpeedMetrics };
