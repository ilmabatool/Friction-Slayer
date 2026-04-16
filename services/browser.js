const { chromium } = require('playwright');

let sharedBrowserPromise = null;

async function getSharedBrowser(launchOptions = {}) {
  if (!sharedBrowserPromise) {
    sharedBrowserPromise = chromium.launch({ headless: true, ...launchOptions });
  }

  return sharedBrowserPromise;
}

async function closeSharedBrowser() {
  if (!sharedBrowserPromise) return;

  const browser = await sharedBrowserPromise;
  sharedBrowserPromise = null;
  await browser.close();
}

let shutdownHooksBound = false;

function bindShutdownHooks() {
  if (shutdownHooksBound) return;
  shutdownHooksBound = true;

  const safeClose = () => {
    closeSharedBrowser().catch(() => {});
  };

  process.on('SIGINT', safeClose);
  process.on('SIGTERM', safeClose);
  process.on('beforeExit', safeClose);
}

bindShutdownHooks();

module.exports = { getSharedBrowser, closeSharedBrowser };
