const { compressToArrayBuffer, decompressArrayBuffer, isCompressionSupported } = require("../compressions");
const { API_URL, setGlobalseoActiveLang, isBrowser, DEFAULT_UNTRANSLATED_VALUE } = require("../configs");
const { renderSelectorState } = require("../selector/renderSelectorState");
const { batchDebounce } = require("./apiDebounce");
const getTranslationCacheFromR2 = require("./getTranslationCacheFromR2");

// The server (queue mode) returns this per-string marker while the background
// worker is still translating a batch. We never render it — we retry until the
// real translation lands or we give up, then fall back to the original text.
const TRANSLATING_MARKER = "globalseo_translating";

// Retry the poll up to 3 times while strings are still translating.
const RETRY_DELAYS_MS = [5000, 10000, 15000]; // 5s, 10s, 15s
const MAX_RETRIES = RETRY_DELAYS_MS.length;

// Merges every caller queued for one flush into a single /get-translations request. Each
// caller's `strings` occupies a contiguous slice of the merged array (order they were
// pushed in, duplicates across callers included verbatim — the server already treats
// repeated text as the same translationKey position-independently, so this changes nothing
// about how any individual string gets translated, only how many HTTP requests it takes).
async function flushBatch(window, language, apiKey, callers) {
  // Every exit out of this function MUST resolve every caller — a hung caller promise
  // wedges its translation cycle exactly the way the old cancel-and-replace debounce did.
  // Resolving [] is the established failure fallback (doFetch resolves [] on fetch error
  // too): downstream reads `response[index]`, gets undefined, and falls back to the R2 map
  // value or source text. Promise resolve is idempotent, so the belt-and-suspenders paths
  // below can't double-deliver.
  const resolveAllEmpty = () => callers.forEach(({ resolve }) => {
    try { resolve([]); } catch (e) { /* resolve never throws, but never risk a caller */ }
  });

  try {
  const mergedStrings = [];
  const ranges = callers.map(({ strings }) => {
    const start = mergedStrings.length;
    mergedStrings.push(...strings);
    return { start, length: strings.length };
  });

  // url/fullUrl come from the FIRST caller's captured location, not a fresh read of
  // window.location here — the batch key already groups callers by pathname-at-call-time,
  // but window.location itself could have moved on by the time this flush runs (a SPA nav
  // during the debounce delay), and every caller in this batch queued against the page they
  // were actually scanning, not whatever page happens to be current now.
  const finalPayload = {
    strings: mergedStrings,
    language: language,
    url: callers[0].url,
    fullUrl: callers[0].fullUrl,
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

  // Replace any leftover marker with "" so we never render "globalseo_translating".
  // Empty on purpose, NOT the source text: translateNodes caches whatever truthy value
  // lands in each slot as the string's translation. Returning the source text here made a
  // give-up (queue still busy after 30s of polling, or the R2 page map missing/unreadable)
  // indistinguishable from a real answer — the source text got cached as the "translation",
  // persisted to localStorage, and from then on the string passed the cache check on every
  // cycle, so /get-translations was NEVER called for it again (SPA lifetime + up to 24h
  // across reloads). An empty slot is falsy: nothing is cached, nothing is rendered
  // (updateNode ignores empty values, so the visible source text stays), and the next
  // translation cycle retries the string.
  function stripMarkers(data) {
    if (!Array.isArray(data)) return data;
    return data.map((v) => {
      if (typeof v === "string" && v.includes(TRANSLATING_MARKER)) return "";
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
          // UI-only; a throw here would skip resolve([]) below and doFetch's promise
          // would never settle — every caller in the batch would hang on a DOM quirk.
          try { renderSelectorState(window); } catch (e) { /* never block delivery */ }
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

  console.log("globalseo payload:", finalPayload);

  let attempt = 0;

  // Gave up with strings still pending → surface the error state so the
  // user can tell translation didn't complete, and show source text. Then hand each
  // caller its own slice of the merged response, stripped the same way a single-caller
  // response always was.
  const finish = (data) => {
    if (hasPendingMarker(data)) {
      window.globalseoError = "translation is still processing, please try again later";
      // UI-only; guarded so finish can never throw — the poll path calls finish from
      // inside a .catch handler, where a second throw would be unhandled and hang
      // every caller in the batch.
      try { renderSelectorState(window); } catch (e) { /* never block delivery */ }
      console.log("GLOBALSEO: translation still pending after max retries");
    }
    const stripped = stripMarkers(data);
    // A non-array response (unexpected server shape) resolves every caller with [] —
    // the old code passed it through and downstream `response[index]` read undefined,
    // which is exactly what slicing [] yields; calling .slice() on it would throw and
    // hang every caller instead.
    const asArray = Array.isArray(stripped) ? stripped : [];
    callers.forEach(({ resolve }, i) => {
      const { start, length } = ranges[i];
      resolve(asArray.slice(start, start + length));
    });
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

    const s = mergedStrings[index];
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
  }).catch((err) => {
    // Catches a throw out of finish/poll, and the one way doFetch CAN reject: window.fetch
    // throwing synchronously inside its executor (fetch's own async failures resolve []).
    // Either way, deliver the fallback rather than leave any caller hanging.
    console.log("GLOBALSEO ERROR:", err?.message || err);
    resolveAllEmpty();
  });
  } catch (err) {
    // Anything that threw before the fetch was even dispatched (compression, payload
    // building). The old code ran compression before its debounce, so a failure there
    // rejected the caller's own promise; here there are N callers and no listener on
    // flushBatch's rejection — resolve them all with the fallback instead.
    console.log("GLOBALSEO ERROR:", err?.message || err);
    resolveAllEmpty();
  }
}

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

  // Concurrent calls for the same project+language+page merge into one request instead of
  // racing each other on a shared debounce timer (see apiDebounce.js) — keyed narrowly so a
  // fast SPA route change or a second language on the page never gets merged into the wrong
  // page's request.
  const url = window.location.pathname;
  const fullUrl = window.location.href;
  const batchKey = `${apiKey}::${language}::${url}`;

  return await new Promise((resolve) => {
    batchDebounce(
      window,
      batchKey,
      { strings, url, fullUrl, resolve },
      (callers) => flushBatch(window, language, apiKey, callers),
      window.isWorker ? 0 : 500
    );
  });
}

module.exports = getTranslationsFromAPI;
