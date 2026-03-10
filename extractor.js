const axios   = require('axios');
const cheerio = require('cheerio');
const fs      = require('fs');

const CITY    = 'Austin, TX';
const KEYWORD = 'Dentists';
const OUTPUT  = 'leads.json';

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function mineLeads() {
  const url = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(KEYWORD)}&geo_location_terms=${encodeURIComponent(CITY)}`;

  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 15000,
  });

  const $     = cheerio.load(data);
  const leads = [];

  $('.result').each((_, el) => {
    const name    = $(el).find('.business-name span').text().trim();
    const website = $(el).find('a.track-visit-website').attr('href') ?? 'N/A';
    if (name) leads.push({ name, website });
  });

  await delay(5000);

  fs.writeFileSync(OUTPUT, JSON.stringify(leads, null, 2), 'utf8');
  console.log(`Saved ${leads.length} leads to ${OUTPUT}`);
}

mineLeads().catch(console.error);
