const { get } = require('axios');
const { load } = require('cheerio');
const { normalizeUrl } = require('../utils/helpers');

async function analyzeHicksLaw(url) {
  try {
    const cleanUrl = normalizeUrl(url);

    // 5-second timeout so it doesn't hang forever
    const { data } = await get(cleanUrl, {
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    const $ = load(data);

    // Count navigation links and buttons (Decision points)
    const navElements = $('nav a').length || $('header a').length || $('a').length;
    const buttons = $('button, .btn, [role="button"]').length;
    const inputs = $('input, select, textarea').length;
    const total = navElements + buttons + inputs;

    let verdict = 'Clear Decision Path';
    if (total > 12 && total <= 20) verdict = 'Needs Simplification';
    if (total > 20) verdict = 'Decision Paralysis';

    const risk = total > 20 ? 'high' : total > 12 ? 'medium' : 'low';

    return {
      links: navElements,
      buttons,
      inputs,
      total,
      verdict,
      risk,
      status: 'SUCCESS'
    };
  } catch (err) {
    console.error('[SCRAPER] Failed to access site:', err.message);
    return {
      links: null,
      buttons: null,
      inputs: null,
      total: null,
      verdict: 'Unavailable',
      risk: 'unknown',
      status: 'BLOCKED',
      error: err.message
    };
  }
}

module.exports = { analyzeHicksLaw };