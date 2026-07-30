const { isCompressionSupported } = require("../compressions");
const getTranslationCacheFromR2 = require("./getTranslationCacheFromR2");

/**
 * The page's translation map, fetched once per URL + language.
 *
 * Source is R2 (translation.globalseo.ai) — see getTranslationCacheFromR2.js for why the
 * KV read it replaced is gone.
 *
 * Memoised per pathname+language, not globally: a SPA route change is a different page and
 * needs its own map, which the old single `window.cloudflareCache` slot prevented. Within
 * a page the map is read once and then updated in place by translateNodes.js as
 * /get-translations answers come back, so there is never a second network read for it.
 */
async function getTranslationCacheFromCloudflare(window, language, apiKey) {
  // The payload is gzipped, so without decompression support we can't read it at all.
  if (!isCompressionSupported(window) || window.isWorker) return {};

  const memoKey = `${window.location.pathname}::${language}`;

  if (!window.cloudflareCacheByPage) window.cloudflareCacheByPage = {};
  if (window.cloudflareCacheByPage[memoKey]) return window.cloudflareCacheByPage[memoKey];

  const cache = await getTranslationCacheFromR2(window, language, apiKey).catch((err) => {
    console.log("getTranslationCacheFromR2 error", err);
    return {};
  });

  // Stored on the window we were handed, NOT gated on isBrowser(). That helper checks the
  // *global* `window`, which is absent when the script runs with an injected window (the
  // JSDOM renderers, tests) — so gating on it silently disabled the memo and re-fetched
  // the map on every translation cycle.
  window.cloudflareCacheByPage[memoKey] = cache;
  // Kept for anything still reading the old field (debug snippets, devtools).
  window.cloudflareCache = cache;

  return cache;
}

module.exports = getTranslationCacheFromCloudflare;
