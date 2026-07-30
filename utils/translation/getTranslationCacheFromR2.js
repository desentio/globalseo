const { decompressString } = require("../compressions");
const { R2_URL, DEFAULT_UNTRANSLATED_VALUE } = require("../configs");

// Language variants the server keeps whole instead of truncating to 2 chars. Must match
// `allowedLangVariants` in weploy/get-translations.js — get this wrong and every key
// misses.
const LANG_VARIANTS = ["es-mx"];

function toLangIso(language) {
  return LANG_VARIANTS.indexOf(language) !== -1 ? language : language.substr(0, 2);
}

// The R2 object key IS the cache key the server writes: `<apiKey>-<url>-<lang>`, where
// url is exactly what we send as `url` in the /get-translations payload —
// window.location.pathname. It is already percent-encoded by the browser, and the server
// stores it verbatim, so it must NOT be encoded again here.
function buildCacheKey(window, language, apiKey) {
  return `${apiKey}-${window.location.pathname}-${toLangIso(language)}`;
}

/**
 * Read a whole page's translation map straight from R2 (translation.globalseo.ai) before
 * touching the API. A hit means the page renders with zero calls to /get-translations.
 *
 * Replaces the old KV read (cdn.globalseo.ai): same payload, but invalidation is
 * immediate — the API deletes the object on /delete-cache, where KV purges took minutes.
 * Two other wins: it's a plain GET with no custom headers, so no CORS preflight, and the
 * key uses the REAL pathname (the KV version hardcoded `-/-`, so every page was looking
 * up the homepage's map).
 */
function getTranslationCacheFromR2(window, language, apiKey) {
  if (!language) {
    throw new Error("globalseoError: Missing language");
  }
  if (!apiKey) {
    console.log("NO API KEY");
    throw new Error("globalseoError: Missing API Key");
  }

  const cacheKey = buildCacheKey(window, language, apiKey);

  return new Promise((resolve) => {
    window.fetch(`${R2_URL}/${cacheKey}`, { method: "GET" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((str) => {
        if (!str) {
          resolve({});
          return;
        }

        return decompressString(window, str, "gzip");
      })
      .then((res) => JSON.parse(res || "{}"))
      .then((map) => {
        // Drop keys the server refused rather than translated (it writes
        // "globalseo-untranslated" when a project is over quota). Treating those as a hit
        // would render source text and never ask again; leaving them out sends them to
        // /get-translations, which retries now that the quota may be sorted.
        let dropped = 0;
        const clean = {};
        Object.keys(map).forEach((key) => {
          const value = map[key];
          if (typeof value === "string" && value.indexOf(DEFAULT_UNTRANSLATED_VALUE) !== -1) {
            dropped++;
            return;
          }
          clean[key] = value;
        });

        if (dropped) console.log(`GLOBALSEO: ${dropped} untranslated marker(s) ignored from cache`);
        resolve(clean);
      })
      .catch(() => {
        // A miss is the normal state for a page nobody has translated yet.
        console.log("No translation cache found in R2");
        resolve({});
      });
  });
}

module.exports = getTranslationCacheFromR2;
module.exports.buildCacheKey = buildCacheKey;
module.exports.toLangIso = toLangIso;
