const { chromium } = require('playwright-chromium');
const { normalizeUrl } = require('../utils/url');
const { UX_LAWS } = require('../utils/ux_laws');

function scoreWithWeight(count, weight) {
  return Math.min(100, Math.round(count * weight * 10));
}

function blockedResponse(message) {
  const uxLaws = Object.entries(UX_LAWS).map(([name, meta]) => ({
    key: name,
    label: name,
    signal: meta.signal,
    weight: meta.weight,
    score: 0,
    status: 'Fail',
    detail: 'Analysis unavailable'
  }));

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
      links: 0,
      buttons: 0,
      inputs: 0,
      total: 0,
      verdict: 'Unavailable',
      risk: 'unknown',
      status: 'BLOCKED'
    },
    tech_stack: [],
    lab_metrics: null,
    ux_laws: uxLaws,
    chartData: {
      labels: uxLaws.map((law) => law.label),
      datasets: [{
        label: 'UX Law Score',
        data: uxLaws.map((law) => law.score),
        borderColor: '#d4af37',
        backgroundColor: 'rgba(212, 175, 55, 0.16)'
      }]
    },
    error: message
  };
}

async function analyzeSite(url) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return blockedResponse('Invalid URL');

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(normalizedUrl, { waitUntil: "networkidle", timeout: 30000 });

    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || null;
      const paints = performance.getEntriesByType('paint') || [];
      const fcpEntry = paints.find((p) => p.name === 'first-contentful-paint');
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint') || [];
      const lcpEntry = lcpEntries.length ? lcpEntries[lcpEntries.length - 1] : null;
      const clsEntries = performance.getEntriesByType('layout-shift') || [];
      const clsValue = clsEntries
        .filter((e) => !e.hadRecentInput)
        .reduce((sum, e) => sum + (Number(e.value) || 0), 0);

      const scriptSrc = Array.from(document.querySelectorAll('script[src]'))
        .map((s) => s.src.toLowerCase());
      const linkHref = Array.from(document.querySelectorAll('link[href]'))
        .map((l) => l.href.toLowerCase());
      const html = document.documentElement.innerHTML.toLowerCase();
      const hostBlob = scriptSrc.concat(linkHref).join(' ') + ' ' + html;

      const stack = [];
      const pushStack = (name, condition) => {
        if (condition && !stack.includes(name)) stack.push(name);
      };

      pushStack('Shopify', !!window.Shopify || hostBlob.includes('cdn.shopify.com') || hostBlob.includes('/shopify/'));
      pushStack('WordPress', hostBlob.includes('wp-content') || hostBlob.includes('wp-includes') || hostBlob.includes('wordpress'));
      pushStack('React', !!window.React || !!document.querySelector('[data-reactroot], [data-reactid]'));
      pushStack('Vue', !!window.Vue || !!document.querySelector('[data-v-]'));
      pushStack('Angular', !!window.ng || !!document.querySelector('[ng-version]'));
      pushStack('jQuery', !!window.jQuery || hostBlob.includes('jquery'));
      pushStack('Bootstrap', hostBlob.includes('bootstrap'));
      pushStack('Tailwind', hostBlob.includes('tailwind'));
      pushStack('Google Tag Manager', hostBlob.includes('googletagmanager.com/gtm.js'));
      pushStack('Cloudflare', hostBlob.includes('cloudflare'));

      const fcpMs = Number.isFinite(fcpEntry?.startTime) ? fcpEntry.startTime : null;
      const lcpMs = Number.isFinite(lcpEntry?.startTime) ? lcpEntry.startTime : null;
      const ttiMs = Number.isFinite(nav?.domInteractive) ? nav.domInteractive : null;

      let perfScoreApprox = null;
      if (Number.isFinite(lcpMs) || Number.isFinite(fcpMs) || Number.isFinite(ttiMs)) {
        const lcpPenalty = Number.isFinite(lcpMs) ? Math.min(50, Math.max(0, (lcpMs - 2500) / 120)) : 16;
        const fcpPenalty = Number.isFinite(fcpMs) ? Math.min(20, Math.max(0, (fcpMs - 1800) / 140)) : 8;
        const ttiPenalty = Number.isFinite(ttiMs) ? Math.min(25, Math.max(0, (ttiMs - 3500) / 220)) : 10;
        const clsPenalty = Number.isFinite(clsValue) ? Math.min(15, Math.max(0, clsValue * 100)) : 6;
        perfScoreApprox = Math.max(0, Math.round(100 - lcpPenalty - fcpPenalty - ttiPenalty - clsPenalty));
      }

      const links = document.querySelectorAll('a').length;
      const buttons = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]').length;
      const inputs = document.querySelectorAll('input, select, textarea').length;
      const urgencySignals = document.querySelectorAll('timer, .timer').length + (document.body?.innerText || '').toLowerCase().split('limited time').length - 1 + (document.body?.innerText || '').toLowerCase().split('left in stock').length - 1;
      const pricingSignals = document.querySelectorAll('.pricing-table, .tier-mid').length;

      return {
        links,
        buttons,
        inputs,
        urgencySignals,
        pricingSignals,
        h1_count: document.querySelectorAll('h1').length,
        meta_description_exists: !!document.querySelector('meta[name="description"]'),
        title_exists: !!document.querySelector('title'),
        title_length: (document.querySelector('title')?.textContent || '').trim().length,
        meta_description_length: (document.querySelector('meta[name="description"]')?.getAttribute('content') || '').trim().length,
        canonical_exists: !!document.querySelector('link[rel="canonical"]'),
        images_total: document.querySelectorAll('img').length,
        images_with_alt: document.querySelectorAll('img[alt]').length,
        stylesheet_count: document.querySelectorAll('link[rel="stylesheet"]').length,
        icon_count: document.querySelectorAll('link[rel*="icon"]').length,
        open_graph_count: document.querySelectorAll('meta[property^="og:"]').length,
        semantic_landmark_count: document.querySelectorAll('nav, main, header, footer').length,
        tech_stack: stack,
        lab_metrics: {
          lcp: Number.isFinite(lcpMs) ? +(lcpMs / 1000).toFixed(2) : null,
          fcp: Number.isFinite(fcpMs) ? +(fcpMs / 1000).toFixed(2) : null,
          tti: Number.isFinite(ttiMs) ? Math.round(ttiMs) : null,
          cls: Number.isFinite(clsValue) ? +clsValue.toFixed(3) : null,
          speedIndex: null,
          performanceScore: Number.isFinite(perfScoreApprox) ? perfScoreApprox : null
        }
      };
    });

    await context.close();

    const hicksCount = metrics.links + metrics.buttons + metrics.inputs;
    const uxLaws = [
      {
        key: 'HicksLaw',
        label: 'HicksLaw',
        signal: UX_LAWS.HicksLaw.signal,
        weight: UX_LAWS.HicksLaw.weight,
        score: scoreWithWeight(hicksCount, UX_LAWS.HicksLaw.weight),
        status: scoreWithWeight(hicksCount, UX_LAWS.HicksLaw.weight) >= 60 ? 'Pass' : 'Fail',
        detail: `${hicksCount} navigation complexity signals detected`
      },
      {
        key: 'LossAversion',
        label: 'LossAversion',
        signal: UX_LAWS.LossAversion.signal,
        weight: UX_LAWS.LossAversion.weight,
        score: scoreWithWeight(metrics.urgencySignals, UX_LAWS.LossAversion.weight),
        status: scoreWithWeight(metrics.urgencySignals, UX_LAWS.LossAversion.weight) >= 60 ? 'Pass' : 'Fail',
        detail: `${metrics.urgencySignals} urgency markers detected`
      },
      {
        key: 'DecoyEffect',
        label: 'DecoyEffect',
        signal: UX_LAWS.DecoyEffect.signal,
        weight: UX_LAWS.DecoyEffect.weight,
        score: scoreWithWeight(metrics.pricingSignals, UX_LAWS.DecoyEffect.weight),
        status: scoreWithWeight(metrics.pricingSignals, UX_LAWS.DecoyEffect.weight) >= 60 ? 'Pass' : 'Fail',
        detail: `${metrics.pricingSignals} pricing decoy markers detected`
      }
    ];

    const risk = hicksCount > 20 ? 'high' : hicksCount > 12 ? 'medium' : 'low';

    return {
      status: 'SUCCESS',
      seo: {
        h1_count: metrics.h1_count,
        meta_description_exists: metrics.meta_description_exists,
        title_exists: metrics.title_exists,
        title_length: metrics.title_length,
        meta_description_length: metrics.meta_description_length,
        canonical_exists: metrics.canonical_exists,
        images_total: metrics.images_total,
        images_with_alt: metrics.images_with_alt,
        image_alt_ratio: metrics.images_total > 0 ? +(metrics.images_with_alt / metrics.images_total).toFixed(2) : 0,
        stylesheet_count: metrics.stylesheet_count,
        icon_count: metrics.icon_count,
        open_graph_count: metrics.open_graph_count,
        semantic_landmark_count: metrics.semantic_landmark_count
      },
      hicks: {
        links: metrics.links,
        buttons: metrics.buttons,
        inputs: metrics.inputs,
        total: hicksCount,
        verdict: hicksCount > 20 ? 'Decision Paralysis' : hicksCount > 12 ? 'Needs Simplification' : 'Clear Decision Path',
        risk,
        status: 'SUCCESS'
      },
      tech_stack: Array.isArray(metrics.tech_stack) ? metrics.tech_stack : [],
      lab_metrics: metrics.lab_metrics || null,
      ux_laws: uxLaws,
      chartData: {
        labels: uxLaws.map((law) => law.label),
        datasets: [{
          label: 'UX Law Score',
          data: uxLaws.map((law) => law.score),
          borderColor: '#d4af37',
          backgroundColor: 'rgba(212, 175, 55, 0.16)'
        }]
      }
    };
  } catch (error) {
    return blockedResponse(error.message);
  } finally {
    await browser.close();
  }
}

module.exports = { analyzeSite };