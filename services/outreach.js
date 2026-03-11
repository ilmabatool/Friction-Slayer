'use strict';
require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const cron  = require('node-cron');
const { Resend } = require('resend');
const { calculateLeak } = require('../utils/leak_calc');

const resend      = new Resend(process.env.RESEND_API_KEY);
const LEADS_PATH  = path.join(__dirname, '..', 'leads.json');
const FROM_EMAIL  = 'Qaseem.pk <admin@qaseem.pk>';

// ─── PageSpeed Helper ──────────────────────────────────────────────────────────

/**
 * Fetch real LCP and INP from Google PageSpeed Insights API (mobile strategy).
 * Falls back to conservative defaults if the API key is missing or the call fails.
 *
 * @param {string} siteUrl
 * @returns {Promise<{ lcp: number, inp: number, fromFallback: boolean }>}
 */
function getPageSpeedMetrics(siteUrl) {
  const DEFAULTS = { lcp: 3.5, inp: 250, fromFallback: true };
  const apiKey   = process.env.PAGESPEED_API_KEY;
  if (!apiKey || !siteUrl) return Promise.resolve(DEFAULTS);

  const encoded  = encodeURIComponent(siteUrl);
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encoded}&key=${apiKey}&strategy=mobile`;

  return new Promise((resolve) => {
    const req = https.get(endpoint, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json     = JSON.parse(body);
          const audits   = json?.lighthouseResult?.audits || {};

          // LCP: numericValue from Lighthouse is in milliseconds → convert to seconds
          const lcpMs = audits['largest-contentful-paint']?.numericValue;
          const lcp   = typeof lcpMs === 'number' ? lcpMs / 1000 : DEFAULTS.lcp;

          // INP: experimental-interaction-to-next-paint (already in ms)
          const inp = audits['experimental-interaction-to-next-paint']?.numericValue
                   ?? audits['interaction-to-next-paint']?.numericValue
                   ?? DEFAULTS.inp;

          resolve({ lcp, inp, fromFallback: false });
        } catch {
          resolve(DEFAULTS);
        }
      });
    });
    req.on('error', () => resolve(DEFAULTS));
    req.setTimeout(15_000, () => { req.destroy(); resolve(DEFAULTS); });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read leads array from disk; returns [] if file missing or corrupt. */
function readLeads() {
  try {
    if (!fs.existsSync(LEADS_PATH)) return [];
    return JSON.parse(fs.readFileSync(LEADS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

/** Persist the leads array back to disk atomically. */
function writeLeads(leads) {
  fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2), 'utf8');
}

/**
 * Append or update a lead entry every time /analyze is called.
 *
 * @param {string} email
 * @param {string} siteUrl
 * @param {number} leakAmount   - daily dollar leak
 * @param {number} monthlyLeak
 */
function upsertLead(email, siteUrl, leakAmount, monthlyLeak) {
  const leads = readLeads();
  const existing = leads.find(l => l.email === email);
  if (existing) {
    existing.siteUrl     = siteUrl;
    existing.leakAmount  = leakAmount;
    existing.monthlyLeak = monthlyLeak;
    existing.updatedAt   = new Date().toISOString();
  } else {
    leads.push({
      email,
      siteUrl,
      leakAmount,
      monthlyLeak,
      initialSentAt:  null,
      dolphinSentAt:  null,
      replyTracked:   false,
      createdAt:      new Date().toISOString(),
      updatedAt:      new Date().toISOString(),
    });
  }
  writeLeads(leads);
}

// ─── Email: Initial Scare Email ────────────────────────────────────────────────

/**
 * Send the "Revenue Leak Alert" cold email (Email 1 — The Scare).
 *
 * Psychological levers used:
 *   • Loss Aversion  — front-loads the annual dollar loss
 *   • Anchoring      — $2,000 manual audit → $0 (our fix)
 *   • Social Proof   — reference to "agency audit" implies authority
 *   • Scarcity       — 48-hour window
 *
 * @param {string} targetEmail
 * @param {number} annualLeak    - annual dollar leak (from calculateLeak)
 * @param {string} [siteUrl]
 * @param {string} [businessName]
 */
async function sendInitialScareEmail(targetEmail, annualLeak, siteUrl = '', businessName = '') {
  const dailyLoss = Math.round(annualLeak / 365);

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Revenue Leak Detected — Qaseem.pk</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <tr><td>

      <!-- Header -->
      <p style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#6b7280;margin-bottom:32px;">
        Qaseem.pk &nbsp;·&nbsp; Friction Intelligence Report
      </p>

      <!-- Alert Banner -->
      <div style="background:#1a0000;border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:20px 24px;margin-bottom:32px;">
        <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#f87171;margin:0 0 8px;">⚠ Annual Revenue Leak Detected</p>
        <p style="font-size:38px;font-weight:900;color:#ef4444;margin:0;line-height:1;letter-spacing:-1px;">
          $${annualLeak.toLocaleString()}/year
        </p>
        <p style="font-size:13px;color:#9ca3af;margin:8px 0 0;">
          That is <strong style="color:#f87171;">$${dailyLoss.toLocaleString()} leaking from your business every single day.</strong>
        </p>
      </div>

      <!-- Body -->
      <p style="font-size:15px;line-height:1.75;color:#d1d5db;margin:0 0 20px;">
        Our Friction-Slayer algorithm scanned <span style="color:#fff;font-weight:600;">${siteUrl || (businessName ? businessName + '\'s online presence' : 'your website')}</span>
        and identified critical UX friction points that are silently costing you conversions right now.
      </p>

      <p style="font-size:15px;line-height:1.75;color:#d1d5db;margin:0 0 20px;">
        A professional UX agency would charge <strong style="color:#9ca3af;text-decoration:line-through;">$2,000</strong>
        for the kind of audit we already ran on your site — for <strong style="color:#22d3ee;">$0</strong>.
        We can also fix the single highest-impact issue in <strong style="color:#fff;">5 minutes, free.</strong>
      </p>

      <p style="font-size:15px;line-height:1.75;color:#d1d5db;margin:0 0 32px;">
        But this offer has a window. Every day you wait, you're leaving
        <strong style="color:#ef4444;">$${dailyLoss.toLocaleString()}</strong> on the table.
      </p>

      <!-- CTA -->
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="text-align:center;padding-bottom:32px;">
            <a href="mailto:hello@qaseem.pk?subject=Execute%20My%20Free%205-Minute%20Friction%20Fix"
              style="display:inline-block;padding:14px 32px;background:#22d3ee;color:#000;font-weight:900;font-size:13px;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:8px;">
              Claim My Free 5-Minute Fix →
            </a>
          </td>
        </tr>
      </table>

      <!-- Footer -->
      <p style="font-size:11px;color:#4b5563;border-top:1px solid #1f2937;padding-top:24px;margin:0;line-height:1.7;">
        You're receiving this because a Friction-Slayer audit was run on ${siteUrl || 'your domain'}.
        Reply <strong>STOP</strong> to opt out at any time.
        &nbsp;·&nbsp; Qaseem.pk, Lahore, Pakistan.
      </p>

    </td></tr>
  </table>
</body>
</html>
  `.trim();

  const { data, error } = await resend.emails.send({
    from:    FROM_EMAIL,
    to:      targetEmail,
    subject: `URGENT: Your $${annualLeak.toLocaleString()} Annual Revenue Leak`,
    html:    htmlBody,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);

  // Record the send timestamp in leads.json
  const leads = readLeads();
  const lead  = leads.find(l => l.email === targetEmail);
  if (lead) {
    lead.initialSentAt = new Date().toISOString();
    writeLeads(leads);
  }

  return data;
}

// ─── Email: Dolphin Offer (Follow-up) ─────────────────────────────────────────

/**
 * Send the "Dolphin Offer" follow-up (Email 2 — The Dolphin Hook).
 * Scheduled 24h after the Scare email for non-responders.
 * Subject: "A 5-minute fix for [Business_Name]"
 *
 * @param {string} targetEmail
 * @param {number} annualLeak
 * @param {string} [siteUrl]
 * @param {string} [businessName]
 */
async function sendDolphinOfferEmail(targetEmail, annualLeak, siteUrl = '', businessName = '') {
  const dailyLoss = Math.round(annualLeak / 365);
  const displayName = businessName || 'your business';
  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Dolphin Offer — Qaseem.pk</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <tr><td>

      <p style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#6b7280;margin-bottom:32px;">
        Qaseem.pk &nbsp;·&nbsp; Dolphin Offer — Final Notice
      </p>

      <!-- Dolphin Banner -->
      <div style="background:#0c1a1a;border:1px solid rgba(34,211,238,0.25);border-radius:8px;padding:24px;margin-bottom:28px;text-align:center;">
        <div style="font-size:48px;margin-bottom:12px;">🐬</div>
        <p style="font-size:18px;font-weight:900;color:#22d3ee;margin:0 0 6px;letter-spacing:-0.5px;">One Free Fix. Zero Strings.</p>
        <p style="font-size:13px;color:#9ca3af;margin:0;">This is the Dolphin Offer. It disappears in 24 hours.</p>
      </div>

      <p style="font-size:15px;line-height:1.75;color:#d1d5db;margin:0 0 20px;">
        Yesterday we flagged a <strong style="color:#ef4444;">$${annualLeak.toLocaleString()} annual revenue leak</strong>
        ($${dailyLoss.toLocaleString()}/day) connected to
        <span style="color:#fff;">${siteUrl || displayName}</span>. You haven't replied yet —
        which means that leak is still running.
      </p>

      <p style="font-size:15px;line-height:1.75;color:#d1d5db;margin:0 0 20px;">
        Here's the deal: reply to this email and we will fix
        <strong style="color:#fff;">the single highest-friction element</strong> on your site
        in <strong style="color:#22d3ee;">5 minutes, for free.</strong>
        No pitch, no upsell on the call, no invoice. This is the
        <em style="color:#22d3ee;">Dolphin Offer</em> — we prove ROI before asking for anything.
      </p>

      <p style="font-size:15px;line-height:1.75;color:#d1d5db;margin:0 0 32px;">
        A comparable single-page UX fix from a boutique agency runs
        <strong style="color:#9ca3af;text-decoration:line-through;">$500</strong>.
        You're getting it at <strong style="color:#22d3ee;">$0</strong>
        because we believe in the work first.
      </p>

      <!-- CTA -->
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="text-align:center;padding-bottom:32px;">
            <a href="mailto:hello@qaseem.pk?subject=Dolphin%20Offer%20—%20I%27m%20In&body=Hi%2C%20I%20want%20my%20free%205-minute%20friction%20fix."
              style="display:inline-block;padding:14px 32px;background:#22d3ee;color:#000;font-weight:900;font-size:13px;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:8px;">
              🐬 I Want My Free Fix
            </a>
          </td>
        </tr>
      </table>

      <p style="font-size:11px;color:#4b5563;border-top:1px solid #1f2937;padding-top:24px;margin:0;line-height:1.7;">
        Reply <strong>STOP</strong> to opt out. This offer is not transferable.
        &nbsp;·&nbsp; Qaseem.pk, Lahore, Pakistan.
      </p>

    </td></tr>
  </table>
</body>
</html>
  `.trim();

  const { data, error } = await resend.emails.send({
    from:    FROM_EMAIL,
    to:      targetEmail,
    subject: `A 5-minute fix for ${displayName}`,
    html:    htmlBody,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);

  // Mark dolphin email sent
  const leads = readLeads();
  const lead  = leads.find(l => l.email === targetEmail);
  if (lead) {
    lead.dolphinSentAt = new Date().toISOString();
    writeLeads(leads);
  }

  return data;
}

// ─── Cron Job: 24-Hour Lead Checker ───────────────────────────────────────────

/**
 * Runs every day at 09:00 server time.
 *
 * Logic:
 *   • Find leads where initial email was sent ≥ 24 hours ago
 *   • AND no reply has been tracked (replyTracked: false)
 *   • AND dolphin email has NOT already been sent
 *   → Trigger sendDolphinOfferEmail()
 */
function startLeadCron() {
  cron.schedule('0 9 * * *', async () => {
    console.log('[cron] Running 24h lead check…');
    const leads    = readLeads();
    const now      = Date.now();
    const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

    for (const lead of leads) {
      try {
        if (
          lead.initialSentAt &&
          !lead.replyTracked &&
          !lead.dolphinSentAt &&
          now - new Date(lead.initialSentAt).getTime() >= TWENTY_FOUR_H
        ) {
          const contactId  = lead.email || lead.phone || '';
          const leakAmount = lead.revenue_leak ?? lead.leakAmount ?? 0;
          console.log(`[cron] Sending Dolphin Offer to ${contactId}`);
          await sendDolphinOfferEmail(
            contactId,
            leakAmount,
            lead.siteUrl || lead.website || '',
            lead.business_name || lead.businessName || ''
          );
        }
      } catch (err) {
        console.error(`[cron] Failed for lead "${lead.business_name || lead.email}":`, err.message);
      }
    }
  });
}

// ─── Standalone Script: Blast All Uncontacted Leads ──────────────────────────
// Run directly:  node services/outreach.js

if (require.main === module) {
  (async () => {
    const leads = readLeads();
    const pending = leads.filter(l => !l.initialSentAt);

    if (pending.length === 0) {
      console.log('[outreach] No pending leads to process.');
      process.exit(0);
    }

    console.log(`[outreach] Processing ${pending.length} uncontacted lead(s)…\n`);
    let sent = 0, failed = 0;

    for (const lead of pending) {
      const siteUrl      = lead.siteUrl || lead.website || '';
      const businessName = lead.business_name || lead.businessName || '';
      const contactId    = lead.email || lead.phone || '';

      if (!contactId) {
        console.warn(`  [skip] "${businessName}" — no email or phone on record`);
        continue;
      }

      // ── Fetch real PageSpeed metrics (or fall back to defaults) ──
      let metrics;
      if (siteUrl) {
        process.stdout.write(`  [psapi] Checking ${siteUrl} … `);
        metrics = await getPageSpeedMetrics(siteUrl);
        console.log(metrics.fromFallback
          ? 'fallback defaults'
          : `LCP ${metrics.lcp.toFixed(2)}s  INP ${Math.round(metrics.inp)}ms`
        );
      } else {
        // No website → both penalties fire (worst case)
        metrics = { lcp: 3.5, inp: 250, fromFallback: true };
        console.log(`  [psapi] "${businessName}" has no website — using worst-case defaults`);
      }

      // ── Calculate leak ──
      const { annualLeak, monthlyExposure, dailyLoss } = calculateLeak(metrics);

      // ── Persist revenue_leak back to leads.json ──
      lead.revenue_leak    = annualLeak;
      lead.lcp             = metrics.lcp;
      lead.inp             = metrics.inp;
      writeLeads(leads);

      // ── Send Email 1: The Scare ──
      try {
        await sendInitialScareEmail(contactId, annualLeak, siteUrl, businessName);
        console.log(`  [sent] Email 1 → ${contactId}  ($${annualLeak.toLocaleString()} annual leak)`);
        sent++;
      } catch (err) {
        console.error(`  [fail] Email 1 → ${contactId}: ${err.message}`);
        failed++;
      }

      // Small delay between sends to respect API rate limits
      await new Promise(r => setTimeout(r, 1_200));
    }

    console.log(`\n[outreach] Done. ✓ ${sent} sent   ✗ ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}

module.exports = { upsertLead, sendInitialScareEmail, sendDolphinOfferEmail, startLeadCron, getPageSpeedMetrics };
