const normalizeUrl = (url) => {
    if (!url) return '';
    let n = url.trim().toLowerCase();
    if (!/^https?:\/\//i.test(n)) n = 'https://' + n;
    return n.replace(/\/+$/, '');
};
module.exports = { normalizeUrl };