const dotenv = require('dotenv');

dotenv.config({ override: true });

const express = require('express');
const path = require('path');
const axios = require('axios');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const session = require('express-session');
const { chromium } = require('playwright-chromium');
const { analyzeSite } = require('./services/analyzer');
const { getPageSpeedMetrics } = require('./services/pagespeed');
const { calculateLeak } = require('./utils/leak_calc');

const { env } = require('./config/env');

const app = express();
const PORT = env.PORT;
let browser = null;

app.use(express.json(), express.urlencoded({ extended: true }));
app.use(session({
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  if (req.accepts('html')) return res.redirect('/auth/google');
  return res.status(401).json({ error: 'Authentication required. Sign in with Google first.' });
}

function getErrorText(err) {
  if (!err) return 'Unknown error';
  if (err.response && err.response.data) {
    const upstream = err.response.data.error || err.response.data;
    if (typeof upstream === 'string') return upstream;
    if (upstream.message) return upstream.message;
  }
  return err.message || 'Unknown error';
}

function fallbackPageSpeedMetrics() {
  return {
    lcp: null,
    fcp: null,
    tti: null,
    cls: null,
    speedIndex: null,
    performanceScore: null,
    isAuthentic: false
  };
}

async function fetchGa4Data(accessToken) {
  if (!env.GA4_PROPERTY_ID) {
    throw new Error('GA4_PROPERTY_ID is missing in environment configuration.');
  }

  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`;

  const { data } = await axios.post(
    endpoint,
    {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'totalRevenue' },
        { name: 'ecommercePurchases' }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    }
  );

  const values = data.rows && data.rows[0] && data.rows[0].metricValues
    ? data.rows[0].metricValues
    : [];

  const traffic = Number(values[0] && values[0].value ? values[0].value : 0);
  const revenue = Number(values[1] && values[1].value ? values[1].value : 0);
  const purchases = Number(values[2] && values[2].value ? values[2].value : 0);
  const aov = purchases > 0 ? +(revenue / purchases).toFixed(2) : 0;

  return { traffic, revenue, purchases, aov };
}

function fallbackGa4Data() {
  return {
    traffic: 5000,
    revenue: 0,
    purchases: 0,
    aov: 50,
    isFallback: true
  };
}

const hasGoogleOAuthConfig = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL
);

if (hasGoogleOAuthConfig) {
  passport.use(new GoogleStrategy({
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL
    },
    function(accessToken, refreshToken, profile, cb) {
      return cb(null, { profile, accessToken });
    }
  ));
} else {
  console.warn('[AUTH DISABLED] Missing Google OAuth environment variables.');
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.get('/auth/status', (req, res) => {
  const authenticated = !!(req.isAuthenticated && req.isAuthenticated());
  const profile = authenticated && req.user && req.user.profile ? req.user.profile : null;

  res.json({
    authenticated,
    user: profile ? {
      displayName: profile.displayName || '',
      email: (profile.emails && profile.emails[0] && profile.emails[0].value) || '',
      avatar: (profile.photos && profile.photos[0] && profile.photos[0].value) || ''
    } : null
  });
});

app.get('/auth/google', (req, res, next) => {
  if (!hasGoogleOAuthConfig) {
    return res.status(503).json({ error: 'Google OAuth is not configured on this server.' });
  }

  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';
  req.session.returnTo = returnTo;
  passport.authenticate('google', {
    scope: ['profile', 'https://www.googleapis.com/auth/analytics.readonly']
  })(req, res, next);
});

app.get('/auth/google/callback',
  (req, res, next) => {
    if (!hasGoogleOAuthConfig) {
      return res.status(503).json({ error: 'Google OAuth is not configured on this server.' });
    }
    return next();
  },
  passport.authenticate('google', { failureRedirect: '/auth/google' }),
  (req, res) => {
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  });

app.get('/auth/logout', async (req, res) => {
  try {
    const accessToken = req.user && req.user.accessToken ? req.user.accessToken : null;
    if (accessToken) {
      await axios.post(
        'https://oauth2.googleapis.com/revoke',
        new URLSearchParams({ token: accessToken }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
      );
    }
  } catch (_err) {
    // Ignore revoke failures and still complete local logout.
  }

  req.logout((logoutErr) => {
    if (logoutErr) return res.redirect('/');
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  });
});

app.get('/api/ga4-data', ensureAuthenticated, async (req, res) => {
  if (!req.user || !req.user.accessToken) return res.status(401).json({ error: 'Not logged in' });

  try {
    const ga4 = await fetchGa4Data(req.user.accessToken);
    res.json(ga4);
  } catch (error) {
    if (error.response && error.response.status) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        return res.status(status).json({ error: 'Google Analytics access denied. Please re-authenticate.' });
      }
      return res.status(502).json({ error: 'GA4 API request failed.', details: error.response.data });
    }
    res.status(500).json({ error: error.message });
  }
});

// ─── UPGRADED ANALYSIS ROUTE ──────────────────────────────────────────────
app.post('/analyze', ensureAuthenticated, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required.' });
    if (!req.user || !req.user.accessToken) {
      return res.status(401).json({ error: 'Authentication required. Sign in with Google first.' });
    }

    console.log(`[SYSTEM] Engaging Google V8 for: ${url}`);

    const [analysisResult, cwvResult] = await Promise.allSettled([
      analyzeSite(url).catch(() => ({ status: 'BLOCKED', seo: null, hicks: null, tech_stack: [], ux_laws: [], chartData: null })),
      getPageSpeedMetrics(url)
    ]);

    const analysis = analysisResult.status === 'fulfilled'
      ? analysisResult.value
      : { status: 'BLOCKED', seo: null, hicks: null, tech_stack: [], ux_laws: [], chartData: null };

    const analysisLabMetrics = analysis && analysis.lab_metrics ? analysis.lab_metrics : null;
    const cwv = cwvResult.status === 'fulfilled'
      ? cwvResult.value
      : (analysisLabMetrics
        ? {
            ...analysisLabMetrics,
            isAuthentic: false,
            source: 'playwright-lab-fallback'
          }
        : fallbackPageSpeedMetrics());

    let ga4 = fallbackGa4Data();
    const warnings = [];

    try {
      ga4 = await fetchGa4Data(req.user.accessToken);
    } catch (ga4Error) {
      warnings.push(`GA4 unavailable: ${getErrorText(ga4Error)}. Using baseline defaults.`);
    }

    if (cwvResult.status === 'rejected') {
      if (analysisLabMetrics) {
        warnings.push(`PageSpeed unavailable: ${getErrorText(cwvResult.reason)}. Using lab fallback metrics from browser run.`);
      } else {
        warnings.push(`PageSpeed unavailable: ${getErrorText(cwvResult.reason)}`);
      }
    }
    if (analysisResult.status === 'rejected') {
      warnings.push('Site HTML analysis was blocked; partial report generated.');
    }

    const report = calculateLeak({
      traffic: ga4.traffic,
      aov: ga4.aov,
      lcp: cwv.lcp,
      tti: cwv.tti,
      seo: analysis.seo,
      ux_laws: analysis.ux_laws,
      brand_authority_score: analysis && analysis.brand_audit && analysis.brand_audit.brand_authority_score
        ? analysis.brand_audit.brand_authority_score.score
        : 0,
    });

    let overallStatus = 'Excellent';
    if (report.totalPenaltyRate > 25) overallStatus = 'Immediate Work Needed';
    else if (report.totalPenaltyRate > 10) overallStatus = 'Average';

    res.json({
      success: true,
      url,
      metrics: cwv,
      ga4,
      analysis,
      chartData: analysis.chartData || null,
      report,
      status: 'VERIFIED_BY_GOOGLE',
      overallStatus,
      warnings
    });

  } catch (err) {
    console.error('[SYSTEM ERROR]', err.message);
    const reason = getErrorText(err);
    if (err.response && err.response.status) {
      return res.status(502).json({ error: 'Scan failed due to upstream Google API error.', reason });
    }
    res.status(500).json({ error: 'Scan failed.', reason });
  }
});

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/audit', ensureAuthenticated, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'audit.html')));

process.on('SIGTERM', async () => {
  try {
    if (browser) await browser.close();
  } finally {
    process.exit(0);
  }
});

app.listen(PORT, async () => {
  console.log(`[MERCENARY ACTIVE] Port ${PORT}`);
  try {
    browser = await chromium.launch();
  } catch (error) {
    console.warn(`[BROWSER DISABLED] ${error.message}`);
  }
});