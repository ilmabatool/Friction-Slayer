const axios = require('axios');
const cheerio = require('cheerio');
const { analyzeHicksLaw } = require('./scraper');
const { normalizeUrl } = require('../utils/url');

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
  const titleText = $('title').text().trim();
  const metaDescription = ($('meta[name="description"]').attr('content') || '').trim();
  const imagesTotal = $('img').length;
  const imagesWithAlt = $('img[alt]').length;

  return {
    h1_count: h1Count,
    meta_description_exists: metaDescriptionExists,
    title_exists: $('title').length > 0,
    title_length: titleText.length,
    meta_description_length: metaDescription.length,
    canonical_exists: $('link[rel="canonical"]').length > 0,
    images_total: imagesTotal,
    images_with_alt: imagesWithAlt
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
  const urgencyTerms = ['limited', 'hurry', 'offer ends', 'only today', 'countdown'];
  const socialTerms = ['testimonial', 'review', 'rated', 'trusted by', 'customers', 'clients'];
  const authorityTerms = ['award-winning', 'certified', 'official', 'expert', 'trusted by'];

  const countMatches = (terms) => terms.reduce((sum, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    const found = bodyText.match(regex);
    return sum + (found ? found.length : 0);
  }, 0);

  const socialProofCount = countMatches(socialTerms);
  const urgencyCount = countMatches(urgencyTerms);
  const authorityCount = countMatches(authorityTerms);

  const principles = {
    anchoring: /original price|was\s*\$|save\s*\$|regular price|before price/.test(bodyText),
    loss_aversion: /limited|hurry|offer ends|only today|last chance|running out/.test(bodyText),
    decoy_effect: /most popular|best value|recommended|compare plans|pricing tiers/.test(bodyText),
    halo_effect: /award|certified|trusted by|expert|official partner|as seen on/.test(bodyText),
    memory_anchor: /remember|don't forget|keep in mind|note this|key takeaway/.test(bodyText)
  };

  return {
    social_proof: hasSocialProofElement || hasSocialProofText,
    urgency_cues: /limited time|hurry|offer ends|only today|countdown/.test(bodyText),
    cta_buttons: $('button, a.btn, [role="button"]').length,
    social_proof_count: socialProofCount,
    urgency_count: urgencyCount,
    authority_count: authorityCount,
    principles
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
    const neuro = analyzeNeuromarketing($);
    neuro.principles.hicks_law = hicks.total === null ? null : hicks.total <= 12;

    return {
      status: 'SUCCESS',
      seo: analyzeSeo($),
      hicks,
      neuromarketing: neuro,
      tech_stack: detectTechStack($)
    };
  } catch (error) {
    return {
      status: 'BLOCKED',
      seo: {
        h1_count: 0,
        meta_description_exists: false,
        title_exists: false,
        title_length: 0,
        meta_description_length: 0,
        canonical_exists: false,
        images_total: 0,
        images_with_alt: 0
      },
      hicks: {
        links: null,
        buttons: null,
        inputs: null,
        total: null,
        verdict: 'Unavailable',
        risk: 'unknown',
        status: 'BLOCKED'
      },
      neuromarketing: {
        social_proof: false,
        urgency_cues: false,
        cta_buttons: 0,
        social_proof_count: 0,
        urgency_count: 0,
        authority_count: 0,
        principles: {
          anchoring: false,
          loss_aversion: false,
          decoy_effect: false,
          hicks_law: null,
          halo_effect: false,
          memory_anchor: false
        }
      },
      tech_stack: [],
      error: error.message
    };
  }
}

module.exports = { analyzeSite };
