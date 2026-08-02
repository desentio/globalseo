const { OVERQUOTA_URL } = require("../configs");

// Kill switch: while disabled we always report "not over quota" (the fail-closed value —
// see below) and never fire the R2 request. Flip to true to re-enable.
const ENABLE_CLIENT_SIDE_OVERQUOTA_CHECK = false;

/**
 * Is this project out of translation quota?
 *
 * Read straight from R2 (overquota.globalseo.ai/<apiKey>), a public mirror of the
 * server's `exceed-trigger-apikey-*` flag. Presence IS the answer: 200 = over quota,
 * 404 = not. The body is irrelevant.
 *
 * Why the client needs to know: an over-quota project's page map has every string it
 * couldn't translate stored as "globalseo-untranslated". Those markers used to be dropped
 * here, which sent every one of them to /get-translations on every page view — a request
 * per visitor per page whose only possible answer is "still over quota". Knowing the
 * project is over quota lets us keep the markers and treat them as cached instead.
 *
 * Fails CLOSED to `false`: a network error, a missing CORS header, anything — and we
 * behave exactly as before, asking the API. Being wrong in that direction costs a request;
 * being wrong the other way would leave a paying customer on source text.
 */
function getOverQuotaFromR2(window, apiKey) {
  if (!ENABLE_CLIENT_SIDE_OVERQUOTA_CHECK) return Promise.resolve(false);
  if (!apiKey) return Promise.resolve(false);

  return new Promise((resolve) => {
    window.fetch(`${OVERQUOTA_URL}/${encodeURIComponent(apiKey)}`, { method: "GET" })
      .then((r) => resolve(r.status === 200))
      .catch(() => resolve(false));
  });
}

/**
 * Once per api key per page load. The flag changes on the scale of a customer topping up
 * their plan, so re-reading it per translation cycle (every SPA route change, every
 * mutation batch) would be one R2 request for information that cannot have changed.
 */
function getOverQuotaFromR2Cached(window, apiKey) {
  if (!ENABLE_CLIENT_SIDE_OVERQUOTA_CHECK) return Promise.resolve(false);
  if (!apiKey) return Promise.resolve(false);

  if (!window.globalseoOverQuotaByApiKey) window.globalseoOverQuotaByApiKey = {};
  if (!window.globalseoOverQuotaByApiKey[apiKey]) {
    // The promise, not the value: concurrent callers share the one in-flight request.
    window.globalseoOverQuotaByApiKey[apiKey] = getOverQuotaFromR2(window, apiKey);
  }

  return window.globalseoOverQuotaByApiKey[apiKey];
}

module.exports = getOverQuotaFromR2Cached;
module.exports.getOverQuotaFromR2 = getOverQuotaFromR2;
