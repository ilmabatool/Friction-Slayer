'use strict';
/**
 * leak_calc.js — Loss Aversion Revenue Leak Formula
 *
 * Formula:
 *   $Leak = (Traffic × Conversion × AOV) × (PenaltyLCP + PenaltyINP)
 *
 * Penalties:
 *   PenaltyLCP = 0.15  if LCP > 2.5s  (Largest Contentful Paint threshold)
 *   PenaltyINP = 0.10  if INP > 200ms (Interaction to Next Paint threshold)
 *
 * Defaults (based on typical SMB baseline):
 *   Traffic    = 3,000 monthly visitors
 *   Conversion = 2% (0.02)
 *   AOV        = $500 average order / service value
 *
 * @example
 *   const { calculateLeak } = require('./utils/leak_calc');
 *   calculateLeak({ lcp: 3.0, inp: 250 });
 *   // → { annualLeak: 90000, monthlyExposure: 7500, dailyLoss: 250,
 *   //     penaltyLCP: 0.15, penaltyINP: 0.10 }
 */

const DEFAULT_TRAFFIC    = 3_000;   // monthly visitors
const DEFAULT_CONVERSION = 0.02;    // 2% baseline CVR
const DEFAULT_AOV        = 500;     // average order value ($)

const THRESHOLD_LCP = 2.5;   // seconds
const THRESHOLD_INP = 200;   // milliseconds

const PENALTY_LCP = 0.15;
const PENALTY_INP = 0.10;

/**
 * Calculate projected revenue leak based on Core Web Vitals.
 *
 * @param {object} metrics
 * @param {number}  metrics.lcp      - Largest Contentful Paint in seconds
 * @param {number}  metrics.inp      - Interaction to Next Paint in milliseconds
 * @param {number} [metrics.traffic] - Monthly visitors (default: 3,000)
 * @param {number} [metrics.aov]     - Average order value in $ (default: 500)
 * @returns {{ annualLeak: number, monthlyExposure: number, dailyLoss: number,
 *             penaltyLCP: number, penaltyINP: number }}
 */
function calculateLeak(metrics) {
  const { lcp, inp } = metrics;
  const traffic = metrics.traffic ?? DEFAULT_TRAFFIC;
  const aov     = metrics.aov     ?? DEFAULT_AOV;

  const penaltyLCP = lcp > THRESHOLD_LCP ? PENALTY_LCP : 0;
  const penaltyINP = inp > THRESHOLD_INP ? PENALTY_INP : 0;

  const totalPenalty = penaltyLCP + penaltyINP;

  // Base monthly revenue at full conversion
  const baseMonthly = traffic * DEFAULT_CONVERSION * aov;

  // Monthly exposure = how much of that baseline is lost to friction
  const monthlyExposure = Math.round(baseMonthly * totalPenalty);
  const annualLeak      = monthlyExposure * 12;
  const dailyLoss       = Math.round(monthlyExposure / 30);

  return {
    annualLeak,
    monthlyExposure,
    dailyLoss,
    penaltyLCP,
    penaltyINP,
  };
}

module.exports = { calculateLeak };
