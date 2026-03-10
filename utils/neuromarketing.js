/**
 * Neuromarketing Brain — Revenue Leak Calculator
 *
 * Baseline model:
 *   • $500 average product / service price
 *   • 2% baseline conversion rate (industry average)
 *   • 1,000 monthly visitors → 20 sales → $10,000 /month baseline revenue
 *
 * Friction rules (backed by Google / Portent research):
 *   LCP > 2.5s  →  15% revenue loss (slow perceived load)
 *   INP > 200ms →  10% revenue loss (sluggish interactivity)
 *
 * @param {number} lcp             - Largest Contentful Paint in seconds
 * @param {number} inp             - Interaction to Next Paint in milliseconds
 * @param {number} [monthlyVisitors=1000]  - Monthly unique visitors
 * @param {number} [productPrice=500]      - Average product / service price ($)
 * @param {number} [conversionRate=0.02]   - Baseline conversion rate (decimal)
 * @returns {{ lossPercent, leakAmount, monthlyLeak, monthlyRevenue, lossAversionMessage }}
 */
function calculateRevenueLeak(lcp, inp, monthlyVisitors = 1000, productPrice = 500, conversionRate = 0.02) {
  // Derive baseline monthly revenue from the $500-product / 2% conversion model
  const monthlyRevenue = Math.round(monthlyVisitors * conversionRate * productPrice);
  let lossPercent = 0;
  const reasons   = [];

  if (lcp > 2.5) {
    lossPercent += 15;
    reasons.push(`LCP of ${lcp.toFixed(2)}s exceeds the 2.5s threshold (−15%)`);
  }

  if (inp > 200) {
    lossPercent += 10;
    reasons.push(`INP of ${Math.round(inp)}ms exceeds the 200ms threshold (−10%)`);
  }

  const monthlyLeak = Math.round((monthlyRevenue * lossPercent) / 100);
  const dailyLeak   = Math.round(monthlyLeak / 30);

  const lossAversionMessage = lossPercent > 0
    ? `Your site is bleeding an estimated $${monthlyLeak.toLocaleString()} per month ` +
      `($${dailyLeak.toLocaleString()} per day) because: ${reasons.join(' + ')}. ` +
      `Every day without a fix, another $${dailyLeak.toLocaleString()} walks out the door.`
    : `Your Core Web Vitals are within healthy thresholds — no revenue leak detected. ` +
      `Your site loads fast and responds quickly, keeping visitors engaged.`;

  return {
    lossPercent,
    leakAmount:   dailyLeak,    // daily dollar amount — used by app.js for the counter
    monthlyLeak,
    monthlyRevenue,
    lossAversionMessage,
  };
}

module.exports = { calculateRevenueLeak };
