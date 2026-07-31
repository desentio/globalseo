const { compressToArrayBuffer, decompressArrayBuffer, isCompressionSupported } = require("../compressions");
const { API_URL, setGlobalseoActiveLang, isBrowser, DEFAULT_UNTRANSLATED_VALUE } = require("../configs");
const { renderSelectorState } = require("../selector/renderSelectorState");
const { apiDebounce } = require("./apiDebounce");
const getTranslationCacheFromR2 = require("./getTranslationCacheFromR2");

// The server (queue mode) returns this per-string marker while the background
// worker is still translating a batch. We never render it — we retry until the
// real translation lands or we give up, then fall back to the original text.
const TRANSLATING_MARKER = "globalseo_translating";

// Retry the poll up to 3 times while strings are still translating.
const RETRY_DELAYS_MS = [5000, 10000, 15000]; // 5s, 10s, 15s
const MAX_RETRIES = RETRY_DELAYS_MS.length;

async function getTranslationsFromAPI(window, strings, language, apiKey) {
  if (!strings || !Array.isArray(strings) || !strings.length) {
    throw new Error("globalseoError: Missing strings");
  }

  if (!language) {
    throw new Error("globalseoError: Missing language");
  }

  if (!apiKey) {
    throw new Error("globalseoError: Missing API Key");
  }

  const finalPayload = {
    strings: strings,
    language: language,
    url: window.location.pathname,
    fullUrl: window.location.href,
    scriptPrevVersion: window.translationScriptPrevVersion
  };

  const stringifiedPayload = JSON.stringify(finalPayload);

  const shouldCompressPayload = isCompressionSupported(window);
  if (!shouldCompressPayload) console.log("GLOBALSEO: Compression is not supported in this browser, therefore the payload will be sent uncompressed.");

  const compressedPayload = shouldCompressPayload ? await compressToArrayBuffer(window, stringifiedPayload, "gzip") : null;
  const body = shouldCompressPayload ? compressedPayload : stringifiedPayload;

  // Bound the request — without this, a stalled API response wedges the
  // translation cycle queue (window.startTranslationCycleInProgress) forever
  // and the MutationObserver keeps firing with no work draining, eventually
  // hanging the tab.
  const API_TIMEOUT_MS = 15000;

  // Does the response still contain any "still translating" markers?
  function hasPendingMarker(data) {
    return Array.isArray(data) && data.some((v) => typeof v === "string" && v.includes(TRANSLATING_MARKER));
  }

  // Replace any leftover marker with the original source string so we never
  // render "globalseo_translating".
  function stripMarkers(data) {
    if (!Array.isArray(data)) return data;
    return data.map((v, i) => {
      if (typeof v === "string" && v.includes(TRANSLATING_MARKER)) {
        const s = strings[i];
        return (typeof s === "string" ? s : s && s.text) || "";
      }
      return v;
    });
  }

  // One fetch attempt. Resolves to the parsed response array (or [] on
  // error/timeout). `retryCount` is sent to the server (bookkeeping only) and
  // caps the client-side retries at 3.
  function doFetch(retryCount) {
    return new Promise((resolve) => {
      let isOk = false;

      const controller = (typeof window.AbortController === "function") ? new window.AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), API_TIMEOUT_MS) : null;

      // Abort the fetch when the user reloads / navigates away. beforeunload
      // fires earlier in the teardown sequence than pagehide; we listen to
      // both so whichever fires first releases the request — pagehide is the
      // safety net for browsers that suppress beforeunload (notably iOS
      // Safari without prior interaction). Without this, the browser's
      // implicit cleanup can lag, leaving the server still chewing on this
      // request when the new page's request arrives.
      const onUnload = () => { try { controller && controller.abort(); } catch (e) {} };
      const canBindUnload = controller && typeof window.addEventListener === "function";
      if (canBindUnload) {
        window.addEventListener("beforeunload", onUnload);
        window.addEventListener("pagehide", onUnload);
      }

      window.fetch(API_URL + "/globalseo/get-translations", {
        method: "POST",
        headers: {
          'Content-Type': shouldCompressPayload ? 'application/octet-stream' : "application/json",
          // 'accept-encoding': 'gzip,deflate',
          "apikey": apiKey,
          // Opt into server-side queueing: the server enqueues untranslated
          // strings and returns markers immediately instead of blocking on AI.
          "usequeue": "true",
          "retrycount": String(retryCount),
        },
        body,
        signal: controller ? controller.signal : undefined,
      })
        .then((response) => {
          if (response.ok) {
            isOk = true;
            return shouldCompressPayload ? response.arrayBuffer() : response.json();
          } else {
            isOk = false;
            return response.json();
          }
        })
        .then(data => shouldCompressPayload && isOk ? decompressArrayBuffer(window, data, "gzip") : data)
        .then(data => shouldCompressPayload && isOk ? JSON.parse(data) : data)
        .then((data) => {
          if (data && data.error) {
            throw new Error(data?.error?.message || data?.error || "Error fetching translations");
          }
          setGlobalseoActiveLang(window, language);

          if (!window.rawTranslations) {
            window.rawTranslations = [];
          }

          window.rawTranslations.push({ ...finalPayload, results: data })
          // Bound rawTranslations — long-lived SPA pages with many cycles
          // would otherwise keep every payload + result forever.
          const RAW_TRANSLATIONS_MAX = 50;
          if (window.rawTranslations.length > RAW_TRANSLATIONS_MAX) {
            window.rawTranslations.splice(0, window.rawTranslations.length - RAW_TRANSLATIONS_MAX);
          }
          resolve(data);
        })
        .catch((err) => {
          const isTimeout = err?.name === "AbortError";
          window.globalseoError = isTimeout ? "translation request timed out" : err.message;
          renderSelectorState(window);
          console.log("GLOBALSEO ERROR:", window.globalseoError);
          resolve([]);
        })
        .finally(() => {
          if (timeoutId) clearTimeout(timeoutId);
          if (canBindUnload) {
            try { window.removeEventListener("beforeunload", onUnload); } catch (e) {}
            try { window.removeEventListener("pagehide", onUnload); } catch (e) {}
          }
        });
    });
  }

  return await new Promise((resolve) => {
    apiDebounce(window, () => {
      console.log("globalseo payload:", finalPayload);

      let attempt = 0;

      // Gave up with strings still pending → surface the error state so the
      // user can tell translation didn't complete, and show source text.
      const finish = (data) => {
        if (hasPendingMarker(data)) {
          window.globalseoError = "translation is still processing, please try again later";
          renderSelectorState(window);
          console.log("GLOBALSEO: translation still pending after max retries");
        }
        resolve(stripMarkers(data));
      };

      // Fill still-pending slots from a freshly read page map, leaving everything else
      // untouched. Keyed the same way translateNodes reads the map — by the string's source
      // text — so a merge-type entry resolves exactly as it does on the normal cache path.
      //
      // A quota marker is NOT an answer: it means the server refused the string rather than
      // translated it, so the slot stays pending and falls back to source text at the end,
      // same as the map read in getTranslationCacheFromCloudflare treats it.
      const mergeFromMap = (data, map) => data.map((value, index) => {
        if (typeof value !== "string" || value.indexOf(TRANSLATING_MARKER) === -1) return value;

        const s = strings[index];
        const text = typeof s === "string" ? s : s && s.text;
        const fromMap = text ? map[text] : undefined;

        if (typeof fromMap !== "string" || !fromMap) return value;
        if (fromMap.indexOf(DEFAULT_UNTRANSLATED_VALUE) !== -1) return value;
        return fromMap;
      });

      // Poll R2, not the API. Once the queue worker finishes a batch it writes the whole
      // page map to R2, so the answer we're waiting for lands there — and reading it from
      // the CDN costs the API nothing, where re-POSTing /get-translations made the server
      // decompress, parse, hit Redis/Postgres and re-serialise for every poll. One API call
      // per batch now, however long the worker takes.
      //
      // Cache-busted (see getTranslationCacheFromR2): the map is served with max-age=60 and
      // every poll falls inside that window, so an ordinary refetch would replay the copy
      // the first read already put in the browser cache and never see the worker's write.
      const poll = (data) => {
        const delay = RETRY_DELAYS_MS[attempt];
        attempt++;
        console.log(`GLOBALSEO: still translating, polling R2 ${attempt}/${MAX_RETRIES} in ${delay}ms`);

        setTimeout(() => {
          getTranslationCacheFromR2(window, language, apiKey, { bustCache: true })
            .then((map) => {
              const merged = mergeFromMap(data, map || {});
              if (!hasPendingMarker(merged) || attempt >= MAX_RETRIES) {
                finish(merged);
                return;
              }
              poll(merged);
            })
            .catch(() => {
              // A failed read is not an answer — keep what we had and try again if there
              // are polls left. getTranslationCacheFromR2 already resolves {} on a miss, so
              // this only fires on something unexpected.
              if (attempt >= MAX_RETRIES) {
                finish(data);
                return;
              }
              poll(data);
            });
        }, delay);
      };

      doFetch(attempt).then((data) => {
        if (!hasPendingMarker(data)) {
          finish(data);
          return;
        }
        poll(data);
      });
    }, window.isWorker ? 0 : 500)();
  });
}

module.exports = getTranslationsFromAPI;
