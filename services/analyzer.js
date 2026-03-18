const axios = require('axios');
const cheerio = require('cheerio');
const { analyzeHicksLaw } = require('./scraper');

function normalizeUrl(url) {
  return url.startsWith('http') ? url : `https://${url}`;
}

function detectTechStack($) {
  const stack = new Set();

  const scripts = $('script[src]')
    .map((_, el) => ($(el).attr('src') || '').toLowerCase())
    .get();

  const html = $.html().toLowerCase();

  if (scripts.some((src) => src.includes('wp-') || src.includes('wordpress'))) {
    stack.add('WordPress');
  }
  if (scripts.some((src) => src.includes('shopify'))) {
    stack.add('Shopify');
  }
  if (scripts.some((src) => src.includes('wix'))) {
    stack.add('Wix');
  }
  if (scripts.some((src) => src.includes('webflow'))) {
    stack.add('Webflow');
  }
  if (scripts.some((src) => src.includes('react')) || html.includes('__next')) {
    stack.add('React');
  }
  if (html.includes('ng-app') || html.includes('angular')) {
    stack.add('Angular');
  }
  if (html.includes('vue')) {
    stack.add('Vue');
  }

  return Array.from(stack);
}

function analyzeSeo($) {
  const h1Count = $('h1').length;
  const metaDescriptionExists = $('meta[name="description"]').length > 0;

  return {
    h1_count: h1Count,
    meta_description_exists: metaDescriptionExists,
    title_exists: $('title').length > 0,
    canonical_exists: $('link[rel="canonical"]').length > 0
  };
}

function analyzeNeuromarketing($) {
  const bodyText = $('body').text().toLowerCase();

  const socialProofSelectors = [
    '[class*="testimonial"]',
    '[id*="testimonial"]',
    '[class*="review"]',
    '[id*="review"]',
    '[class*="rating"]',
    '[id*="rating"]'
  ];

  const hasSocialProofElement = socialProofSelectors.some((selector) => $(selector).length > 0);
  const hasSocialProofText = /testimonial|reviews?|rated|trusted by|customers|clients/.test(bodyText);

  return {
    social_proof: hasSocialProofElement || hasSocialProofText,
    urgency_cues: /limited time|hurry|offer ends|only today|countdown/.test(bodyText),
    cta_buttons: $('button, a.btn, [role="button"]').length
  };
}

async function analyzeSite(url) {
  const cleanUrl = normalizeUrl(url);

  try {
    const [{ data }, hicks] = await Promise.all([
      axios.get(cleanUrl, {
        timeout: 7000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      }),
      analyzeHicksLaw(cleanUrl)
    ]);

    const $ = cheerio.load(data);

    return {
      status: 'SUCCESS',
      seo: analyzeSeo($),
      hicks,
      neuromarketing: analyzeNeuromarketing($),
      tech_stack: detectTechStack($)
    };
  } catch (error) {
    return {
      status: 'ERROR',
      seo: { h1_count: 0, meta_description_exists: false, title_exists: false, canonical_exists: false },
      hicks: { elements: 12, status: 'SIMULATED_FALLBACK' },
      neuromarketing: { social_proof: false, urgency_cues: false, cta_buttons: 0 },
      tech_stack: [],
      error: error.message
    };
  }
}

module.exports = { analyzeSite };
