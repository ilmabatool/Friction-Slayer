const { normalizeUrl } = require('./url');

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

module.exports = { clamp, normalizeUrl };
