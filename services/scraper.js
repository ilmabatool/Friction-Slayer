const axios   = require('axios');
const cheerio = require('cheerio');

async function analyzeHicksLaw(url) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 15000,
  });

  const $       = cheerio.load(data);
  const links   = $('a').length;
  const buttons = $('button').length;
  const inputs  = $('input').length;
  const total   = links + buttons + inputs;

  if (total > 12) {
    return {
      verdict: 'Decision Paralysis',
      message: `Warning: ${total} interactive elements detected (${links} links, ${buttons} buttons, ${inputs} inputs). `
        + `Hick's Law states that decision time grows logarithmically with the number of choices. `
        + `Fix: Apply the Halo Effect — reduce to ≤7 primary actions and let one dominant CTA `
        + `carry a visual authority halo (size, colour, whitespace) so visitors commit instantly.`,
      haloEffectAdvice: 'Consolidate navigation. Surface one primary CTA with a strong visual halo '
        + '(enlarged, high-contrast, surrounded by whitespace). Archive secondary links in a footer '
        + 'or collapsed menu to eliminate cognitive load at the decision moment.',
      total,
    };
  }

  return {
    verdict: 'Clean UI Halo Effect',
    message: `Clean UI Halo Effect active: only ${total} interactive elements. `
      + `Visitors form a fast positive first impression and trust your brand authority — `
      + `lower bounce rate, faster decisions, higher conversion probability.`,
    haloEffectAdvice: null,
    total,
  };
}

module.exports = { analyzeHicksLaw };
