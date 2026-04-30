const { compressToArrayBuffer, decompressArrayBuffer, isCompressionSupported } = require("../compressions");
const { API_URL, setGlobalseoActiveLang, isBrowser } = require("../configs");
const { renderSelectorState } = require("../selector/renderSelectorState");
const { apiDebounce } = require("./apiDebounce");

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

  let isOk = false;

  // Bound the request — without this, a stalled API response wedges the
  // translation cycle queue (window.startTranslationCycleInProgress) forever
  // and the MutationObserver keeps firing with no work draining, eventually
  // hanging the tab.
  const API_TIMEOUT_MS = 15000;

  return await new Promise((resolve) => {
    apiDebounce(window, () => {
      console.log("globalseo payload:", finalPayload);

      const controller = (typeof window.AbortController === "function") ? new window.AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), API_TIMEOUT_MS) : null;

      // Abort the fetch when the user reloads / navigates away. Without this,
      // the browser's implicit cleanup can lag, leaving the server still
      // chewing on this request when the new page's request arrives — that's
      // what makes "in-flight + reload = stuck" happen. Explicit abort makes
      // the server see the close immediately so it can free its worker.
      const onPageHide = () => { try { controller && controller.abort(); } catch (e) {} };
      const canBindUnload = controller && typeof window.addEventListener === "function";
      if (canBindUnload) window.addEventListener("pagehide", onPageHide);

      window.fetch(API_URL + "/globalseo/get-translations", {
        method: "POST",
        headers: {
          'Content-Type': shouldCompressPayload ? 'application/octet-stream' : "application/json",
          // 'accept-encoding': 'gzip,deflate',
          "apikey": apiKey
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
          if (data.error) {
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
            try { window.removeEventListener("pagehide", onPageHide); } catch (e) {}
          }
        });
    }, window.isWorker ? 0 : 500)();
  });
}

module.exports = getTranslationsFromAPI;
