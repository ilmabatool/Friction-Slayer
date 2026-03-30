function getEnv(key, fallback) {
  const value = process.env[key];
  if (value !== undefined && value !== '') return value;
  return fallback;
}

const env = {
  PORT: Number(getEnv('PORT', 3000)),
  SESSION_SECRET: getEnv('SESSION_SECRET', 'friction-secret'),
  GOOGLE_CLIENT_ID: getEnv('GOOGLE_CLIENT_ID', ''),
  GOOGLE_CLIENT_SECRET: getEnv('GOOGLE_CLIENT_SECRET', ''),
  GOOGLE_CALLBACK_URL: getEnv('GOOGLE_CALLBACK_URL', 'http://localhost:3000/auth/google/callback'),
  GA4_PROPERTY_ID: getEnv('GA4_PROPERTY_ID', ''),
  GOOGLE_PAGESPEED_API_KEY: getEnv('GOOGLE_PAGESPEED_API_KEY', getEnv('PAGESPEED_API_KEY', ''))
};

module.exports = { env };
