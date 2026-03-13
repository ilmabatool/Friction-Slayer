// File: utils/leak_calc.js
/**
 * Friction-Slayer Revenue Leak Calculator
 * Psychological Trigger: Loss Aversion
 */
exports.calculateLeak = (metrics) => {
    const traffic = metrics.traffic || 3000; // Average monthly traffic for local businesses
    const aov = 500;                         // Average Order Value (e.g., one Dental implant/Lawyer consult)
    const convBase = 0.02;                   // 2% standard conversion rate baseline
    
    // Baseline monthly revenue without technical friction
    const baselineMonthlyRevenue = traffic * convBase * aov;

    // Penalties: LCP > 2.5s (15% revenue drop), INP > 200ms (10% revenue drop)
    // If metrics are missing, assume "Bleeding" state for the outreach hook
    const penaltyLCP = (metrics.lcp > 2.5 || metrics.lcp === null) ? 0.15 : 0;
    const penaltyINP = (metrics.inp > 200 || metrics.inp === null) ? 0.10 : 0;

    const monthlyExposure = baselineMonthlyRevenue * (penaltyLCP + penaltyINP);
    const annualLeak = monthlyExposure * 12;

    return {
        annualLeak: Math.round(annualLeak).toLocaleString(),
        monthlyExposure: Math.round(monthlyExposure).toLocaleString(),
        dailyLoss: (monthlyExposure / 30).toFixed(2),
        hicksScore: (metrics.elements || 0) > 50 ? "High Friction" : "Optimized",
        isVulnerable: (penaltyLCP + penaltyINP) > 0
    };
};