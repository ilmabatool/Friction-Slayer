const axios = require('axios');
const cheerio = require('cheerio');

async function analyzeHicksLaw(url) {
  try {
    const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
    
    // 5-second timeout so it doesn't hang forever
    const { data } = await axios.get(cleanUrl, { 
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } 
    });
    
    const $ = cheerio.load(data);
    
    // Count navigation links and buttons (Decision points)
    const navElements = $('nav a').length || $('header a').length;
    const buttons = $('button, .btn, [role="button"]').length;
    const total = navElements + buttons;

    return {
      elements: total,
      status: "SUCCESS"
    };
  } catch (err) {
    console.error("[SCRAPER] Failed to access site:", err.message);
    // If blocked, return a default "cluttered" value so the app doesn't crash
    return { elements: 12, status: "SIMULATED_FALLBACK" }; 
  }
}

module.exports = { analyzeHicksLaw };