// File: extractor.js
const { chromium } = require('playwright');
const fs = require('fs');

async function mineLeads(industry = "Dentist", city = "Lahore") {
    console.log(`⟩_ Launching Extraction Engine: ${industry} in ${city}...`);
    
    // Headless: false helps bypass basic bot detection on Maps
    const browser = await chromium.launch({ headless: false }); 
    const page = await browser.newPage();
    
    const query = encodeURIComponent(`${industry} in ${city}`);
    await page.goto(`https://www.google.com/maps/search/${query}`);
    
    try {
        await page.waitForSelector('div[role="feed"]', { timeout: 15000 });
        
        // Scroll to load ~50 listings
        for (let i = 0; i < 5; i++) {
            await page.mouse.wheel(0, 4000);
            await page.waitForTimeout(2000);
        }

        const leads = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('div[role="article"]'));
            return items.map(el => {
                const name = el.getAttribute('aria-label');
                const website = el.querySelector('a[data-value="Website"]')?.href || null;
                const ratingText = el.querySelector('span[role="img"]')?.ariaLabel || "0";
                const rating = parseFloat(ratingText.split(' ')[0]) || 0;
                
                return {
                    business_name: name,
                    website: website,
                    rating: rating,
                    scrapedAt: new Date().toISOString(),
                    initialSentAt: null
                };
            }).filter(lead => !lead.website || lead.rating < 4.0);
        });

        // Deduplicate and Save
        const existing = fs.existsSync('leads.json') ? JSON.parse(fs.readFileSync('leads.json')) : [];
        const finalLeads = [...existing, ...leads].filter((v, i, a) => 
            a.findIndex(t => t.business_name === v.business_name) === i
        );
        
        fs.writeFileSync('leads.json', JSON.stringify(finalLeads, null, 2));
        console.log(`✅ Success: ${leads.length} high-ticket targets captured.`);

    } catch (e) {
        console.error("❌ Scraper Blocked or Layout Changed:", e.message);
    } finally {
        await browser.close();
    }
}

// EXECUTE
mineLeads("Dentist", "Lahore");