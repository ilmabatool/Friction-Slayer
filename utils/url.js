function normalizeUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://${url}`;
}

module.exports = { normalizeUrl };
