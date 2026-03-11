"""extractor.py — Google Maps Lead Scraper

Scrapes Google Maps for local businesses, filters to those with no website OR
a rating below 4.0, and saves qualifying leads to leads.json.

Usage:
    python extractor.py
    python extractor.py --industry Lawyers --city Karachi --limit 100

Requirements:
    pip install -r requirements.txt
    playwright install chromium
"""

import argparse
import asyncio
import json
import math
import os
import random
import re
import sys
from datetime import datetime
from pathlib import Path

from fake_useragent import UserAgent
from playwright.async_api import async_playwright, TimeoutError as PwTimeout

LEADS_PATH = Path(__file__).parent / "leads.json"
TARGET_COUNT = 100

# ── Helpers ────────────────────────────────────────────────────────────────────

def _load_leads() -> list:
    if LEADS_PATH.exists():
        try:
            return json.loads(LEADS_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _save_leads(leads: list) -> None:
    LEADS_PATH.write_text(json.dumps(leads, indent=2, ensure_ascii=False), encoding="utf-8")


def _human_delay(lo: float = 0.8, hi: float = 1.8) -> float:
    """Return a random sleep duration with slight jitter."""
    return random.uniform(lo, hi) + random.gauss(0, 0.1)


# ── Core Scraper ───────────────────────────────────────────────────────────────

async def scrape_google_maps(industry: str, city: str, limit: int = TARGET_COUNT) -> list:
    ua = UserAgent()
    user_agent = ua.random

    print(f"[extractor] Starting scrape: '{industry}' in '{city}' — target {limit} listings")
    print(f"[extractor] User-Agent: {user_agent[:60]}...")

    leads: list[dict] = []
    seen_names: set[str] = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        context = await browser.new_context(
            user_agent=user_agent,
            viewport={"width": 1366, "height": 768},
            locale="en-US",
            timezone_id="Asia/Karachi",
            java_script_enabled=True,
        )
        # Mask the webdriver flag
        await context.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
        )

        page = await context.new_page()

        # ── Navigate to Google Maps search ────────────────────────────────────
        query = f"{industry} in {city}"
        url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"
        print(f"[extractor] Navigating to: {url}")
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)

        # ── Dismiss consent/cookie banner if present ──────────────────────────
        try:
            consent = page.locator(
                'button[aria-label*="Accept"], button[aria-label*="Agree"], '
                '#L2AGLb, button:has-text("Accept all"), button:has-text("Agree")'
            ).first
            await consent.click(timeout=4_000)
            await asyncio.sleep(_human_delay(0.5, 1.2))
            print("[extractor] Dismissed consent dialog")
        except PwTimeout:
            pass  # No consent dialog — continue

        # ── Wait for results feed ─────────────────────────────────────────────
        feed_selector = 'div[role="feed"]'
        try:
            await page.wait_for_selector(feed_selector, timeout=15_000)
        except PwTimeout:
            print("[extractor] ERROR: Results feed not found. Google may have changed its layout.")
            await browser.close()
            return []

        # ── Scroll loop to load 'limit' results ───────────────────────────────
        print("[extractor] Scrolling to collect listings...")
        scroll_attempts = 0
        max_scroll_attempts = math.ceil(limit / 5) + 20  # generous ceiling

        while len(leads) < limit and scroll_attempts < max_scroll_attempts:
            # Collect all visible listing cards
            cards = await page.query_selector_all(
                'div[role="feed"] > div[jsaction]:not([aria-label=""])'
            )

            # Fallback selector if primary returns nothing
            if not cards:
                cards = await page.query_selector_all(
                    'a[href*="/maps/place/"]'
                )

            for card in cards:
                if len(leads) >= limit:
                    break

                try:
                    lead = await _extract_card(page, card)
                except Exception as exc:
                    print(f"[extractor] Card parse error: {exc}")
                    continue

                if lead is None:
                    continue

                # Deduplicate
                name_key = lead["business_name"].strip().lower()
                if name_key in seen_names:
                    continue
                seen_names.add(name_key)

                # ── THE FILTER ────────────────────────────────────────────────
                no_website = not lead["website"]
                low_rating = lead["rating"] is not None and lead["rating"] < 4.0
                no_rating  = lead["rating"] is None  # unrated = qualifies

                if no_website or low_rating or no_rating:
                    leads.append(lead)
                    status = "no-website" if no_website else f"rating {lead['rating']}"
                    print(f"  [+] {lead['business_name'][:45]:<45} | {status}")

            # Check for end-of-results sentinel
            end_text = await page.query_selector(
                "text=\"You've reached the end of the list\""
            )
            if end_text:
                print("[extractor] Reached end of results.")
                break

            # Scroll the feed down
            feed = await page.query_selector(feed_selector)
            if feed:
                await feed.evaluate("el => el.scrollBy(0, 600)")
            else:
                await page.mouse.wheel(0, 600)

            await asyncio.sleep(_human_delay(1.2, 2.5))
            scroll_attempts += 1

        await browser.close()

    print(f"[extractor] Collected {len(leads)} qualifying leads.")
    return leads


async def _extract_card(page, card) -> dict | None:
    """Extract all data fields from a single result card."""

    # ── Business name ─────────────────────────────────────────────────────────
    name = None
    for sel in [".fontHeadlineSmall", ".qBF1Pd", "[aria-label]"]:
        el = await card.query_selector(sel)
        if el:
            name = (await el.inner_text()).strip()
            if name:
                break
    if not name:
        # Last resort: aria-label on the card itself
        name = await card.get_attribute("aria-label") or ""
        name = name.strip()
    if not name:
        return None

    # ── Rating ────────────────────────────────────────────────────────────────
    rating = None
    rating_el = await card.query_selector("span.MW4etd")
    if rating_el:
        rating_text = (await rating_el.inner_text()).strip()
        try:
            rating = float(rating_text)
        except ValueError:
            rating = None

    # ── Address ───────────────────────────────────────────────────────────────
    address = ""
    for sel in ["div.W4Efsd:last-child", "span.lI9IFe", ".UsdlK"]:
        el = await card.query_selector(sel)
        if el:
            candidate = (await el.inner_text()).strip()
            # Addresses typically contain digits or common separators
            if candidate and (any(c.isdigit() for c in candidate) or "," in candidate):
                address = candidate
                break

    # ── Phone ─────────────────────────────────────────────────────────────────
    phone = ""
    # Phone is often in a W4Efsd span alongside an icon aria-label="Phone number"
    phone_spans = await card.query_selector_all("div.W4Efsd span")
    phone_pattern = re.compile(r"[\+\d][\d\s\-\(\)]{6,}")
    for span in phone_spans:
        text = (await span.inner_text()).strip()
        if phone_pattern.match(text):
            phone = text
            break

    # ── Website ───────────────────────────────────────────────────────────────
    website = ""
    # The website chip is a nested <a> or button with data-value="Website"
    website_el = await card.query_selector(
        'a[data-value="Website"], [aria-label*="website" i], a.lcr4fd'
    )
    if website_el:
        href = await website_el.get_attribute("href") or ""
        # Google wraps external links in /url?q=... redirect
        if "/url?q=" in href:
            match = re.search(r"/url\?q=([^&]+)", href)
            website = match.group(1) if match else href
        elif href.startswith("http"):
            website = href

    # ── Validate card has minimal useful data ─────────────────────────────────
    if not name or (not address and not phone and rating is None):
        # Likely a placeholder / separator row
        return None

    return {
        "business_name": name,
        "website":       website,
        "rating":        rating,
        "phone":         phone,
        "address":       address,
        "revenue_leak":  None,
    }


# ── Persistence ────────────────────────────────────────────────────────────────

def merge_leads(new_leads: list) -> tuple[int, int]:
    """Merge new_leads into leads.json; deduplicate by business_name.
    Returns (added, skipped)."""
    existing = _load_leads()
    existing_names = {l.get("business_name", "").strip().lower() for l in existing}

    added = 0
    skipped = 0
    for lead in new_leads:
        key = lead["business_name"].strip().lower()
        if key in existing_names:
            skipped += 1
        else:
            existing.append(lead)
            existing_names.add(key)
            added += 1

    _save_leads(existing)
    return added, skipped


# ── Entry Point ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Scrape Google Maps for bleeding-business leads."
    )
    parser.add_argument("--industry", default="Dentists",
                        help="Business type to search (default: Dentists)")
    parser.add_argument("--city",     default="Lahore",
                        help="City to search in (default: Lahore)")
    parser.add_argument("--limit",    default=100, type=int,
                        help="Max qualifying leads to collect (default: 100)")
    args = parser.parse_args()

    leads = asyncio.run(scrape_google_maps(args.industry, args.city, args.limit))

    if not leads:
        print("[extractor] No leads collected. Exiting.")
        sys.exit(1)

    added, skipped = merge_leads(leads)
    print(f"[extractor] Done. Added {added} new leads, skipped {skipped} duplicates.")
    print(f"[extractor] leads.json now at: {LEADS_PATH}")


if __name__ == "__main__":
    main()
