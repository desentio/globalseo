const { isCompressionSupported } = require("../compressions");
const getTranslationCacheFromR2 = require("./getTranslationCacheFromR2");
const { dropUntranslatedValues } = getTranslationCacheFromR2;
const getOverQuotaFromR2 = require("./getOverQuotaFromR2");

/**
 * The page's translation map, fetched once per URL + language.
 *
 * Source is R2 (translation.globalseo.ai) — see getTranslationCacheFromR2.js for why the
 * KV read it replaced is gone. Fetched together with the project's over-quota flag
 * (overquota.globalseo.ai/<apiKey>), because what the map's "globalseo-untranslated"
 * markers MEAN depends on it:
 *
 *   - not over quota → drop them, so those strings go to /get-translations and get another
 *     attempt;
 *   - over quota     → KEEP them, so they count as cached and we make no call at all. The
 *     API can only answer "still over quota" for exactly those strings, and it was being
 *     asked once per visitor per page view. updateNode ignores the marker and leaves the
 *     source text on the page — which is what the API response produced anyway.
 *
 * allSettled, not all: the flag is an optimisation. If that request fails the map still
 * renders and we fall back to asking the API, i.e. the behaviour from before it existed.
 * Both requests go out together, so the flag costs no extra round trip.
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

  const [cacheResult, overQuotaResult] = await Promise.allSettled([
    getTranslationCacheFromR2(window, language, apiKey),
    getOverQuotaFromR2(window, apiKey),
  ]);

  if (cacheResult.status === "rejected") {
    console.log("getTranslationCacheFromR2 error", cacheResult.reason);
  }

  const rawCache = cacheResult.status === "fulfilled" ? (cacheResult.value || {}) : {};
  const isOverQuota = overQuotaResult.status === "fulfilled" && overQuotaResult.value === true;

  const cache = isOverQuota ? rawCache : dropUntranslatedValues(rawCache);
  if (isOverQuota) console.log("GLOBALSEO: project is over quota — serving what is cached, not requesting more");

  // Read by translateNodes.js (it skips the API call for strings the map already marks
  // untranslated) and useful to anything debugging why a page stopped translating.
  window.globalseoIsOverQuota = isOverQuota;

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
