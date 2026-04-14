const axios = require('axios');
const cheerio = require('cheerio');
const { analyzeHicksLaw } = require('./scraper');
const { normalizeUrl } = require('../utils/url');
const { UX_LAWS } = require('../utils/ux_laws');

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
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
  const titleText = $('title').text().trim();
  const metaDescription = ($('meta[name="description"]').attr('content') || '').trim();
  const imagesTotal = $('img').length;
  const imagesWithAlt = $('img[alt]').length;
  const stylesheetCount = $('link[rel="stylesheet"]').length;
  const iconCount = $('link[rel*="icon"]').length;
  const openGraphCount = $('meta[property^="og:"]').length;
  const semanticLandmarkCount = $('nav, main, header, footer').length;

  return {
    h1_count: h1Count,
    meta_description_exists: metaDescriptionExists,
    title_exists: $('title').length > 0,
    title_length: titleText.length,
    meta_description_length: metaDescription.length,
    canonical_exists: $('link[rel="canonical"]').length > 0,
    images_total: imagesTotal,
    images_with_alt: imagesWithAlt,
    image_alt_ratio: imagesTotal > 0 ? +(imagesWithAlt / imagesTotal).toFixed(2) : 0,
    stylesheet_count: stylesheetCount,
    icon_count: iconCount,
    open_graph_count: openGraphCount,
    semantic_landmark_count: semanticLandmarkCount
  };
}

function analyzeUxLaws($, seo, hicks, techStack) {
  const bodyText = $('body').text().toLowerCase();
  const interactiveTargets = $('button, [role="button"], input[type="submit"], input[type="button"], a.btn, .btn').length;
  const headings = $('h1, h2, h3').length;
  const paragraphs = $('p').length;
  const sections = $('section').length;
  const lists = $('ul, ol').length;
  const forms = $('form').length;
  const semanticLandmarks = $('nav, main, header, footer').length;
  const stylesheets = $('link[rel="stylesheet"]').length;
  const icons = $('link[rel*="icon"]').length;
  const openGraph = $('meta[property^="og:"]').length;

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
  const socialTerms = ['testimonial', 'review', 'rated', 'trusted by', 'customers', 'clients'];
  const authorityTerms = ['award-winning', 'certified', 'official', 'expert', 'trusted by'];

  const countMatches = (terms) => terms.reduce((sum, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    const found = bodyText.match(regex);
    return sum + (found ? found.length : 0);
  }, 0);

  const socialProofCount = countMatches(socialTerms);
  const authorityCount = countMatches(authorityTerms);

  const hicksScore = hicks.total === null ? 0 : clamp(100 - Math.max(0, hicks.total - 12) * 4);
  const fittsScore = clamp(100 - Math.max(0, interactiveTargets - 6) * 8 - Math.max(0, forms - 2) * 6);
  const jakobScore = clamp(
    (seo.title_exists ? 15 : 0) +
    (seo.meta_description_exists ? 15 : 0) +
    (seo.canonical_exists ? 10 : 0) +
    (semanticLandmarks > 0 ? 20 : 0) +
    (techStack.length > 0 ? 15 : 0) +
    ((interactiveTargets > 0 || forms > 0) ? 10 : 0) +
    (bodyText.includes('trusted by') ? 5 : 0)
  );
  const millerScore = clamp(
    18 +
    Math.min(headings * 10, 30) +
    Math.min(lists * 10, 20) +
    Math.min(sections * 8, 20) +
    Math.min(forms * 6, 10) -
    Math.max(0, paragraphs - 12) * 2
  );
  const aestheticScore = clamp(
    (seo.title_exists ? 10 : 0) +
    (seo.meta_description_exists ? 10 : 0) +
    (stylesheets > 0 ? 25 : 0) +
    (icons > 0 ? 10 : 0) +
    (openGraph > 0 ? 15 : 0) +
    Math.round((seo.image_alt_ratio || 0) * 30)
  );
  const socialProofScore = clamp(
    (hasSocialProofElement || hasSocialProofText ? 35 : 0) +
    Math.min(socialProofCount * 8, 24) +
    Math.min(authorityCount * 10, 30) +
    (bodyText.includes('trusted by') ? 8 : 0)
  );

  const uxLaws = [
    {
      key: UX_LAWS[0].key,
      label: UX_LAWS[0].label,
      signal: UX_LAWS[0].signal,
      score: hicksScore,
      status: hicksScore >= 60 ? 'Pass' : 'Fail',
      detail: hicks.total === null
        ? 'Decision count unavailable'
        : `${hicks.total} interactive choices detected`
    },
    {
      key: UX_LAWS[1].key,
      label: UX_LAWS[1].label,
      signal: UX_LAWS[1].signal,
      score: fittsScore,
      status: fittsScore >= 60 ? 'Pass' : 'Fail',
      detail: `${interactiveTargets} prominent hit targets detected`
    },
    {
      key: UX_LAWS[2].key,
      label: UX_LAWS[2].label,
      signal: UX_LAWS[2].signal,
      score: jakobScore,
      status: jakobScore >= 60 ? 'Pass' : 'Fail',
      detail: `${semanticLandmarks} familiar page landmarks and ${techStack.length} known platform signals`
    },
    {
      key: UX_LAWS[3].key,
      label: UX_LAWS[3].label,
      signal: UX_LAWS[3].signal,
      score: millerScore,
      status: millerScore >= 60 ? 'Pass' : 'Fail',
      detail: `${headings} headings, ${lists} lists, and ${sections} sections shaping the content chunks`
    },
    {
      key: UX_LAWS[4].key,
      label: UX_LAWS[4].label,
      signal: UX_LAWS[4].signal,
      score: aestheticScore,
      status: aestheticScore >= 60 ? 'Pass' : 'Fail',
      detail: `${stylesheets} stylesheets, ${icons} icons, ${openGraph} social tags, and ${Math.round((seo.image_alt_ratio || 0) * 100)}% image alt coverage`
    },
    {
      key: UX_LAWS[5].key,
      label: UX_LAWS[5].label,
      signal: UX_LAWS[5].signal,
      score: socialProofScore,
      status: socialProofScore >= 60 ? 'Pass' : 'Fail',
      detail: `${socialProofCount} social proof cues and ${authorityCount} authority cues`
    }
  ];

  const chartData = {
    labels: uxLaws.map((law) => law.label),
    datasets: [{
      label: 'UX Law Score',
      data: uxLaws.map((law) => law.score),
      borderColor: '#d4af37',
      backgroundColor: 'rgba(212, 175, 55, 0.16)',
      pointBackgroundColor: '#ffd700',
      pointBorderColor: '#0d0d0d',
      pointHoverBackgroundColor: '#ffffff',
      pointHoverBorderColor: '#d4af37'
    }]
  };

  return {
    social_proof: hasSocialProofElement || hasSocialProofText,
    cta_buttons: interactiveTargets,
    social_proof_count: socialProofCount,
    authority_count: authorityCount,
    ux_laws: uxLaws,
    chartData
  };
}

function createBlockedUxLaws() {
  const uxLaws = UX_LAWS.map((law) => ({
    key: law.key,
    label: law.label,
    signal: law.signal,
    score: 0,
    status: 'Fail',
    detail: 'Analysis unavailable'
  }));

  return {
    ux_laws: uxLaws,
    chartData: {
      labels: uxLaws.map((law) => law.label),
      datasets: [{
        label: 'UX Law Score',
        data: uxLaws.map(() => 0),
        borderColor: '#d4af37',
        backgroundColor: 'rgba(212, 175, 55, 0.16)',
        pointBackgroundColor: '#ffd700',
        pointBorderColor: '#0d0d0d',
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: '#d4af37'
      }]
    }
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
    const techStack = detectTechStack($);
    const seo = analyzeSeo($);
    const ux = analyzeUxLaws($, seo, hicks, techStack);

    return {
      status: 'SUCCESS',
      seo,
      hicks,
      tech_stack: techStack,
      ux_laws: ux.ux_laws,
      chartData: ux.chartData
    };
  } catch (error) {
    const blockedUx = createBlockedUxLaws();

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
        images_with_alt: 0,
        image_alt_ratio: 0,
        stylesheet_count: 0,
        icon_count: 0,
        open_graph_count: 0,
        semantic_landmark_count: 0
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
      tech_stack: [],
      ux_laws: blockedUx.ux_laws,
      chartData: blockedUx.chartData,
      error: error.message
    };
  }
}

module.exports = { analyzeSite };
