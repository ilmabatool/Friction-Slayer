// File: utils/leak_calc.js
/**
 * Friction-Slayer Revenue Leak Calculator — Scientific Edition
 * Psychological Trigger: Loss Aversion via granular, auditable breakdown
 */
exports.calculateLeak = (metrics) => {
    const traffic = metrics.traffic || 5000;   // Monthly visitors
    const aov     = metrics.aov     || 50;     // Average Order Value ($)
    const convBase = 0.02;                     // 2% industry baseline conversion rate

    // Baseline monthly revenue without friction
    const baselineMonthlyRevenue = traffic * convBase * aov;

    const breakdown = [];
    let totalPenaltyRate = 0;

    // ── Penalty 1: LCP > 2.5s → -15% Conversion ──────────────────────────
    if (metrics.lcp === null || metrics.lcp === undefined || metrics.lcp > 2.5) {
        const rate  = 0.15;
        const loss  = Math.round(baselineMonthlyRevenue * rate);
        totalPenaltyRate += rate;
        breakdown.push({
            issue:       'Slow Page Load (LCP)',
            detail:      `LCP of ${metrics.lcp ? metrics.lcp.toFixed(2) + 's' : 'unknown'} exceeds 2.5 s threshold`,
            penaltyRate: rate,
            monthlyLoss: loss,
        });
    }

    // ── Penalty 2: No H1 or multiple H1s → -5% SEO Visibility ────────────
    const seo = metrics.seo || {};
    if (seo.h1_count !== 1) {
        const rate  = 0.05;
        const loss  = Math.round(baselineMonthlyRevenue * rate);
        totalPenaltyRate += rate;
        breakdown.push({
            issue:       'Missing / Duplicate H1 Tag',
            detail:      `${seo.h1_count ?? 0} H1 tag(s) found — should be exactly 1`,
            penaltyRate: rate,
            monthlyLoss: loss,
        });
    }

    // ── Penalty 3: No Meta Description → -5% CTR ─────────────────────────
    if (!seo.meta_description_exists) {
        const rate  = 0.05;
        const loss  = Math.round(baselineMonthlyRevenue * rate);
        totalPenaltyRate += rate;
        breakdown.push({
            issue:       'Missing Meta Description',
            detail:      'No meta description reduces organic click-through rate by ~5 %',
            penaltyRate: rate,
            monthlyLoss: loss,
        });
    }

    // ── Penalty 4: Low Social Proof → -10% Trust Factor ──────────────────
    const neuro = metrics.neuromarketing || {};
    if (!neuro.social_proof) {
        const rate  = 0.10;
        const loss  = Math.round(baselineMonthlyRevenue * rate);
        totalPenaltyRate += rate;
        breakdown.push({
            issue:       'No Social Proof Signals',
            detail:      'Missing reviews, testimonials, or client signals reduce trust by ~10 %',
            penaltyRate: rate,
            monthlyLoss: loss,
        });
    }

    const monthlyExposure = Math.round(baselineMonthlyRevenue * totalPenaltyRate);
    const annualLeak      = monthlyExposure * 12;

    return {
        annualLeak,
        monthlyExposure,
        dailyLoss:             +(monthlyExposure / 30).toFixed(2),
        totalPenaltyRate:      Math.round(totalPenaltyRate * 100),
        baselineMonthlyRevenue: Math.round(baselineMonthlyRevenue),
        breakdown,
        isVulnerable:          totalPenaltyRate > 0,
    };
};