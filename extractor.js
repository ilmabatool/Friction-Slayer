// File: extractor.js
const { existsSync, readFileSync, writeFileSync } = require('fs');
const { getSharedBrowser, closeSharedBrowser } = require('./services/browser');

async function mineLeads(industry = 'Dentist', city = 'Lahore') {
    console.log(`⟩_ Launching Extraction Engine: ${industry} in ${city}...`);

    let browser;
    let context;

    try {
        // Use a shared browser instance and isolate each run with its own context.
        browser = await getSharedBrowser({ headless: false });
        context = await browser.newContext();
        const page = await context.newPage();

        const query = encodeURIComponent(`${industry} in ${city}`);
        await page.goto(`https://www.google.com/maps/search/${query}`, { waitUntil: 'domcontentloaded' });

        const feed = page.getByRole('feed').first();
        await feed.waitFor({ state: 'visible', timeout: 15000 });

        // Scroll to load ~50 listings
        for (let i = 0; i < 5; i++) {
            await page.mouse.wheel(0, 4000);
            await page.waitForTimeout(2000);
        }

        const listingLocator = page.locator('[role="article"]');
        const listingCount = await listingLocator.count();
        const leads = [];

        for (let i = 0; i < listingCount; i++) {
            const listing = listingLocator.nth(i);
            const business_name = await listing.getAttribute('aria-label');

            const websiteLocator = listing.locator('text=Website').first();
            let website = null;
            if (await websiteLocator.count()) {
                website = await websiteLocator.getAttribute('href');
            }

            const ratingText = await listing
                .locator('span[role="img"]')
                .first()
                .getAttribute('aria-label')
                .catch(() => '0');
            const rating = parseFloat((ratingText || '0').split(' ')[0]) || 0;

            const lead = {
                business_name,
                website,
                rating,
                scrapedAt: new Date().toISOString(),
                initialSentAt: null
            };

            if (!lead.website || lead.rating < 4.0) {
                leads.push(lead);
            }
        }

        // Deduplicate and Save
        const existing = existsSync('leads.json') ? JSON.parse(readFileSync('leads.json')) : [];
        const finalLeads = [...existing, ...leads].filter((v, i, a) =>
            a.findIndex((t) => t.business_name === v.business_name) === i
        );

        writeFileSync('leads.json', JSON.stringify(finalLeads, null, 2));
        console.log(`✅ Success: ${leads.length} high-ticket targets captured.`);
    } catch (e) {
        console.error('❌ Scraper Blocked or Layout Changed:', e.message);
    } finally {
        if (context) {
            await context.close().catch(() => {});
        }
        if (browser) {
            await closeSharedBrowser().catch(() => {});
        }
    }
}

// EXECUTE
mineLeads('Dentist', 'Lahore');