function calculateBrandLoss({ traffic, aov, conversionRate, brandAuthorityScore }) {
    const safeTraffic = Number.isFinite(traffic) ? traffic : 0;
    const safeAov = Number.isFinite(aov) ? aov : 0;
    const safeConversionRate = Number.isFinite(conversionRate) ? conversionRate : 0;
    const score = Number.isFinite(brandAuthorityScore) ? brandAuthorityScore : 0;

    const currentMonthlyRevenue = safeTraffic * safeConversionRate * safeAov;
    const trustPenaltyRate = score < 60 ? 0.30 : 0;
    const monthlyTrustLoss = Math.round(currentMonthlyRevenue * trustPenaltyRate);

    const premiumAov = safeAov * 1.20;
    const premiumMonthlyRevenue = safeTraffic * safeConversionRate * premiumAov;
    const monthlyBrandPremiumGap = Math.round(Math.max(0, premiumMonthlyRevenue - currentMonthlyRevenue));

    return {
        trust_penalty_applied: trustPenaltyRate > 0,
        trust_penalty_rate: Math.round(trustPenaltyRate * 100),
        monthly_trust_loss: monthlyTrustLoss,
        annual_trust_loss: monthlyTrustLoss * 12,
        monthly_brand_premium_gap: monthlyBrandPremiumGap,
        annual_brand_premium_gap: monthlyBrandPremiumGap * 12,
        annual_brand_debt: (monthlyTrustLoss + monthlyBrandPremiumGap) * 12
    };
}

exports.calculateBrandLoss = calculateBrandLoss;

exports.calculateLeak = (metrics) => {
    const traffic = metrics.traffic ?? 5000;
    const aov = metrics.aov ?? 50;
    const convBase = 0.02;
    const baselineMonthlyRevenue = traffic * convBase * aov;
    const uxLaws = Array.isArray(metrics.ux_laws) ? metrics.ux_laws : [];
    const brandAuthorityScore = Number.isFinite(metrics.brand_authority_score) ? metrics.brand_authority_score : 0;
    const breakdown = [];
    let failCount = 0;
    let abandonmentRate = 0.18;

    uxLaws.forEach((law) => {
        const failed = law && (law.status === 'Fail' || law.passed === false || (Number.isFinite(law.score) && law.score < 60));
        if (!failed) return;

        failCount += 1;

        if (law.label === 'Social Proof + Authority') {
            abandonmentRate *= 2;
        }

        const penaltyRate = law.label === 'Social Proof + Authority'
            ? 0.15 + abandonmentRate
            : 0.15;
        const monthlyLoss = Math.round(baselineMonthlyRevenue * penaltyRate);

        breakdown.push({
            issue: law.label,
            detail: law.detail || `${law.label} failed the UX audit.`,
            penaltyRate: Math.round(penaltyRate * 100),
            monthlyLoss
        });
    });

    const monthlyExposure = breakdown.reduce((sum, item) => sum + item.monthlyLoss, 0);
    const annualLeak = monthlyExposure * 12;
    const leakRate = baselineMonthlyRevenue > 0 ? (monthlyExposure / baselineMonthlyRevenue) * 100 : 0;

    const brandLoss = calculateBrandLoss({
        traffic,
        aov,
        conversionRate: convBase,
        brandAuthorityScore
    });

    return {
        annualLeak,
        monthlyExposure,
        dailyLoss: +(monthlyExposure / 30).toFixed(2),
        leakAmount: +(monthlyExposure / 30).toFixed(2),
        totalPenaltyRate: Math.round(leakRate),
        baselineMonthlyRevenue: Math.round(baselineMonthlyRevenue),
        abandonmentRate: Math.round(abandonmentRate * 100),
        failCount,
        breakdown,
        isVulnerable: failCount > 0,
        brand_authority_score: brandAuthorityScore,
        annual_brand_debt: brandLoss.annual_brand_debt,
        monthly_brand_premium_gap: brandLoss.monthly_brand_premium_gap,
        annual_brand_premium_gap: brandLoss.annual_brand_premium_gap,
        trust_penalty_applied: brandLoss.trust_penalty_applied,
        trust_penalty_rate: brandLoss.trust_penalty_rate,
        monthly_trust_loss: brandLoss.monthly_trust_loss,
        annual_trust_loss: brandLoss.annual_trust_loss
    };
};