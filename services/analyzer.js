const axios   = require('axios');
const cheerio = require('cheerio');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const HICKS_LAW_THRESHOLD = 12;

async function fetchPage(url) {
  const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
  try {
    const response = await axios.get(cleanUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 20000,
      maxRedirects: 5,
    });
    return { data: response.data, status: response.status, blocked: false };
  } catch (error) {
    if (error.response?.status === 403 || error.response?.status === 429) {
      return { data: null, status: error.response.status, blocked: true };
    }
    throw error;
  }
}

async function analyzeSite(url) {
  const { data, status, blocked } = await fetchPage(url);

  if (blocked || !data) {
    return {
      status: 'BLOCKED',
      httpStatus: status,
      seo: null,
      hicks: null,
      neuromarketing: null,
      tech_stack: [],
    };
  }

  const $ = cheerio.load(data);

  // ── SEO Health ────────────────────────────────────────────────────────────
  const titleText     = $('title').text().trim();
  const metaDescContent = $('meta[name="description"]').attr('content') || '';
  const h1Count       = $('h1').length;
  const totalImages   = $('img').length;
  const imagesWithAlt = $('img[alt]')
    .filter((_, el) => ($(el).attr('alt') || '').trim() !== '').length;

  const seo = {
    title_exists:             titleText.length > 0,
    title_length:             titleText.length,
    meta_description_exists:  metaDescContent.length > 0,
    meta_description_length:  metaDescContent.length,
    h1_count:                 h1Count,
    images_total:             totalImages,
    images_with_alt:          imagesWithAlt,
  };

  // ── Hick's Law (Cognitive Load) ───────────────────────────────────────────
  const links   = $('a').length;
  const buttons = $('button').length;
  const inputs  = $('input').length;
  const total   = links + buttons + inputs;

  const hicks = {
    links,
    buttons,
    inputs,
    total,
    verdict: total > HICKS_LAW_THRESHOLD ? 'Decision Paralysis' : 'Clean UI',
  };

  // ── Neuromarketing Triggers ───────────────────────────────────────────────
  const visibleText = $('p, h1, h2, h3, h4, h5, h6, span, li')
    .map((_, el) => $(el).text())
    .get()
    .join(' ')
    .toLowerCase();

  const URGENCY_KEYWORDS      = ['limited', 'left', 'expire', 'now', 'today', 'only'];
  const SOCIAL_PROOF_KEYWORDS = ['review', 'rated', 'testimonial', 'client', 'partner'];
  const AUTHORITY_KEYWORDS    = ['award', 'certified', 'expert', 'official', 'guaranteed'];

  const countKeywords = (kws, text) => kws.filter(k => text.includes(k)).length;

  const urgencyCount     = countKeywords(URGENCY_KEYWORDS, visibleText);
  const socialProofCount = countKeywords(SOCIAL_PROOF_KEYWORDS, visibleText);
  const authorityCount   = countKeywords(AUTHORITY_KEYWORDS, visibleText);

  const neuromarketing = {
    urgency:            urgencyCount > 0,
    urgency_count:      urgencyCount,
    social_proof:       socialProofCount > 0,
    social_proof_count: socialProofCount,
    authority:          authorityCount > 0,
    authority_count:    authorityCount,
  };

  // ── Tech Stack Hints ──────────────────────────────────────────────────────
  const scriptSrcs    = $('script[src]').map((_, el) => $(el).attr('src') || '').get().join(' ');
  const metaGenerator = ($('meta[name="generator"]').attr('content') || '').toLowerCase();
  const bodyHtml      = $.html() || '';

  const tech_stack = [];
  if (metaGenerator.includes('wordpress') || bodyHtml.includes('wp-content'))
    tech_stack.push('WordPress');
  if (scriptSrcs.includes('shopify') || bodyHtml.includes('Shopify'))
    tech_stack.push('Shopify');
  if (scriptSrcs.includes('react') || bodyHtml.includes('__NEXT_DATA__') || scriptSrcs.includes('_next'))
    tech_stack.push('React/Next.js');
  if (scriptSrcs.includes('wix') || /['"(]https?:\/\/[^'"()]*\.wix\.com/.test(bodyHtml))
    tech_stack.push('Wix');
  if (bodyHtml.includes('squarespace'))
    tech_stack.push('Squarespace');
  if (scriptSrcs.includes('gtag') || scriptSrcs.includes('analytics.js'))
    tech_stack.push('Google Analytics');
  if (scriptSrcs.includes('fbq') || /['"(]https?:\/\/connect\.facebook\.net\//.test(bodyHtml))
    tech_stack.push('Facebook Pixel');

  return {
    status: 'OK',
    httpStatus: status,
    seo,
    hicks,
    neuromarketing,
    tech_stack,
  };
}

module.exports = { analyzeSite };
