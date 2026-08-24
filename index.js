const { isBrowser, getGlobalseoOptions, SPECIAL_API_KEYS } = require('./utils/configs.js');
const { createLanguageSelect } = require('./utils/selector/createLanguageSelect.js');
const { getLanguageFromLocalStorage } = require('./utils/languages/getSelectedLanguage.js');
const setOptions = require('./utils/options/setOptions.js');
const startTranslationCycle = require('./utils/translation/startTranslationCycle.js');
const extractOptionsFromScript = require('./extractOptionsFromScript.js');
const replaceLinks = require('./replaceLinks.js');
const { renderSelectorState } = require('./utils/selector/renderSelectorState.js');

async function getTranslations(window, apiKey, optsArgs = {}) {
  try {
    // console.log("GLOBALSEO initializing...", isBrowser());
    
    if (!optsArgs?.originalLanguage && !SPECIAL_API_KEYS.includes(apiKey)) {
      console.error("GLOBALSEO: data-original-language is required, please add it to the script tag")
      return;
    }
    const debounceDuration = optsArgs.debounceDuration == null ? 0 : optsArgs.debounceDuration;

    setOptions(window, apiKey, optsArgs)

    // save language to local storage & delay 1 second to wait google translate
    // await Promise.allSettled([
    //   optsArgs.originalLanguage ? getDefinedLanguages(optsArgs.originalLanguage, optsArgs.allowedLanguages) : fetchLanguageList(apiKey),
    //   // delay(1000)
    // ]);

    if (optsArgs.createSelector && isBrowser()) {
      await createLanguageSelect(window, optsArgs);
    }

    // handle google translate
    if (isBrowser() && (window.document.querySelector('html.translated-ltr') || window.document.querySelector('html.translated-rtl'))) return;

    const timeout = getGlobalseoOptions(window).timeout;

    function runReplaceLinks() {
      const sliced = window.location.hostname.split('.').slice(1).join('.');
      const domain = sliced.includes('.') ? sliced : window.location.hostname;
      const isInOriginalDomain = (domain == window.location.hostname) || window.location.hostname.startsWith(`www`);

      if (optsArgs.translationMode === 'subdomain' && !isInOriginalDomain) {
        replaceLinks(window, {
          langParam: optsArgs.langParam,
          lang: optsArgs.paramsLang,
          translationMode: optsArgs.translationMode,
          prefix: optsArgs.domainSourcePrefix,
          sourceOrigin: optsArgs.sourceOrigin
        });
      }

      if (optsArgs.translationMode === 'domain') {
        // only rewrite when we're actually on a translated host
        const originalDomainHost = (optsArgs.originalDomain || "").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
        const onOriginal = !originalDomainHost
          || window.location.host === originalDomainHost
          || window.location.hostname === originalDomainHost;
        if (!onOriginal) {
          replaceLinks(window, {
            langParam: optsArgs.langParam,
            lang: window.activeDomainLang || optsArgs.paramsLang,
            translationMode: optsArgs.translationMode,
            prefix: optsArgs.domainSourcePrefix,
            sourceOrigin: optsArgs.sourceOrigin,
            originalDomain: optsArgs.originalDomain,
            langToDomainMap: optsArgs.langToDomainMap
          });
        }
      }
    }

    return await startTranslationCycle(window, window.document.body, apiKey, timeout, true)
      .then(() => {
        // console.log("GLOBALSEO: Translation cycle completed")
        runReplaceLinks();
        return window
      }) // return window object as response
      .catch((err) => {
        console.log("getTranslations error", err);
        if (window.shouldConsoleglobalseoError) console.error(err);
      })
      .finally(() => {
        // resolve(window)

        // console.log("GLOBALSEO: MutationObserver added")

        if (isBrowser() && !window.isDomListenerAdded) {
          // Select the target node
          const targetNode = window.document.body;

          // Create an observer instance with a callback to handle mutations
          const observer = new MutationObserver(function(mutationsList) {
            // 1) Drop mutations from inside our own language selector wrapper.
            //    renderSelectorState writes loading/ready/error UI there on
            //    every cycle; if we treat those as "new content" we queue
            //    another cycle, which calls renderSelectorState again in
            //    finally, which writes again — a tight loop that pegs CPU.
            //    The wrapper has `globalseo-exclude` so extractTextNodes
            //    already skips it; this mirrors that for the observer.
            function isInsideLangSelector(mutation) {
              try {
                const target = mutation?.target;
                // A characterData mutation's target is the Text node itself, which has no
                // .closest() of its own (Element-only). Without resolving to the parent
                // element here, any selector-UI text rewritten in place (e.g. a "Loading..."
                // label's data changed directly) would slip past this guard now that
                // characterData mutations are observed too, reopening the CPU-pegging loop
                // this function exists to prevent.
                const element = target && target.nodeType === 3 /* TEXT_NODE */ ? target.parentElement : target;
                if (element?.closest && element.closest('.globalseo-lang-selector-wrapper')) return true;
                const className = element?.className || "";
                return typeof className === "string" && (className.includes("globalseo-lang-selector-value") || className.includes("weploy-lang-selector-value"));
              } catch(err) {
                return false;
              }
            }

            // 1b) Debounce protection for characterData mutations specifically. childList
            //     additions are normally one-shot (a node is inserted once), but a text node
            //     whose .data keeps changing in place — a countdown timer, a live ticker, a
            //     stock price — would otherwise re-trigger a translation cycle on every tick
            //     forever, each one asking the API to translate content that's already stale
            //     by the time an answer comes back. The debounceDuration passed into
            //     startTranslationCycle only coalesces calls that land inside one delay
            //     window (and defaults to 0, i.e. no real protection) — it doesn't stop a
            //     node that keeps mutating forever from re-arming that window indefinitely.
            //     Track per-node mutation frequency instead: once a node crosses the
            //     threshold within the rolling window, treat it as "live" and stop reacting
            //     to its characterData changes for a cooldown period. WeakMap so entries for
            //     removed/GC'd nodes clean themselves up.
            const CHARACTER_DATA_NOISE_WINDOW_MS = 3000;
            const CHARACTER_DATA_NOISE_THRESHOLD = 3;
            const CHARACTER_DATA_NOISE_COOLDOWN_MS = 30000;
            if (!window.globalseoCharacterDataActivity) window.globalseoCharacterDataActivity = new WeakMap();
            function isCharacterDataNodeNoisy(node) {
              if (!node) return true;
              const now = Date.now();
              const activity = window.globalseoCharacterDataActivity;
              const entry = activity.get(node);
              if (!entry) {
                activity.set(node, { count: 1, windowStart: now, mutedUntil: 0 });
                return false;
              }
              if (entry.mutedUntil && now < entry.mutedUntil) return true;
              if (now - entry.windowStart > CHARACTER_DATA_NOISE_WINDOW_MS) {
                // window elapsed without crossing the threshold — reset and start counting fresh
                entry.count = 1;
                entry.windowStart = now;
                entry.mutedUntil = 0;
                return false;
              }
              entry.count++;
              if (entry.count > CHARACTER_DATA_NOISE_THRESHOLD) {
                entry.mutedUntil = now + CHARACTER_DATA_NOISE_COOLDOWN_MS;
                // console.log("GLOBALSEO: text node updates too frequently, pausing translation cycles for it", node.data);
                return true;
              }
              return false;
            }

            const relevantMutations = [];
            for (let mutation of mutationsList) {
              if (!isInsideLangSelector(mutation)) relevantMutations.push(mutation);
            }
            // Nothing to do — our own UI writes alone shouldn't kick a cycle.
            if (!relevantMutations.length) return;

            // 2) While a translation cycle is in flight, skip the per-mutation
            // work below. That work does two full-document querySelectorAll
            // calls and writes to the DOM (classList.remove on details), each
            // of which re-fires this callback — during a long cycle (e.g.,
            // waiting on get-translations) the observer thrashes the JS thread
            // and the tab becomes unresponsive to reload/navigation.
            // We still queue a follow-up cycle so nodes added during the
            // current cycle are re-scanned after it finishes; startTranslationCycle
            // collapses overlapping calls via startTranslationCycleNext.
            //
            // Do NOT chain `.then(runReplaceLinks)` here. startTranslationCycle
            // returns undefined immediately when it's only queuing (it stores
            // promiseFunction in startTranslationCycleNext and resolves the
            // outer async wrapper). A `.then` fires synchronously after each
            // observer batch — and runReplaceLinks does full-document
            // querySelectorAll('a') + querySelectorAll('[href],[src]') in
            // subdomain mode, so framework mutations during a slow / failed
            // fetch pile up into thousands of full-DOM scans → frozen tab.
            // Per-cycle link rewriting already happens inside
            // startTranslationCycleBase for subdomain/subdirectory modes.
            if (window.startTranslationCycleInProgress) {
              startTranslationCycle(window, window.document.body, apiKey, debounceDuration).catch(console.log);
              return;
            }
            let nodes = [];

            // check if the selectors need to be recreated
            let elementsWeploy = Array.from(window.document.querySelectorAll('.weploy-select')).filter(el => !el.querySelector('.weploy-lang-selector-ready-icon'));

            let elementsGlobalSeo = Array.from(window.document.querySelectorAll('.globalseo-select')).filter(el => !el.querySelector('.globalseo-lang-selector-ready-icon'));

            let elements = [...elementsWeploy, ...elementsGlobalSeo];

            // remove classname to recreate selectors
            elements.forEach(el => {
              const details = el.querySelector('details')
              if (details) {
                details.classList.remove('globalseo-lang-selector-element');
                details.classList.remove('weploy-lang-selector-element');
              }
            })

            for(let mutation of relevantMutations) {
              if (mutation.type === 'childList') {
                // Handling added nodes
                for(let addedNode of mutation.addedNodes) {
                  nodes.push(addedNode)
                }
              } else if (mutation.type === 'characterData') {
                // Text updated in place (element.textContent = "..." / textNode.data = "..."
                // on a node that already existed) never fires a childList mutation, so
                // without this branch that new text is invisible to the whole pipeline —
                // no cycle ever runs for it, regardless of cache or quota state. Gated by
                // the noise guard above so a constantly-ticking node doesn't queue a cycle
                // on every tick.
                if (!isCharacterDataNodeNoisy(mutation.target)) {
                  nodes.push(mutation.target)
                }
              }
            }

            if (elements.length && optsArgs.createSelector) {
              createLanguageSelect(window, optsArgs).then(() => {
                if (nodes.length) startTranslationCycle(window, window.document.body, apiKey, debounceDuration).then(() => { runReplaceLinks(); }).catch(console.log)
              });
            } else {
              if (nodes.length) startTranslationCycle(window, window.document.body, apiKey, debounceDuration).then(() => { runReplaceLinks(); }).catch(console.log)
            }
          });

          // Set up observer configuration: what to observe. characterData catches text
          // updated in place on an existing node (see the branch above) — childList alone
          // only sees nodes being added/removed.
          const config = { childList: true, subtree: true, characterData: true };

          // Start observing the target node with configured settings
          observer.observe(targetNode, config);

          // Disconnect the observer on beforeunload so it physically can't
          // fire during the browser's teardown phase. With heavy DOM activity
          // (e.g., framework rerendering, translation in progress), the
          // observer's per-batch work can lock the JS thread and delay the
          // browser from completing reload/navigation.
          if (typeof window.addEventListener === "function") {
            window.addEventListener("beforeunload", () => {
              try { observer.disconnect(); } catch (e) {}
            });
          }

          window.isDomListenerAdded = true;
        }
      })

    // return await new Promise(async (resolve, reject) => {
    //   try {
    //     await startTranslationCycle(window, window.document.body, apiKey, timeout, true).catch(reject).finally(() => resolve(window));
    //   } catch(err) {
    //     console.log("getTranslations error", err);
    //     if (window.shouldConsoleglobalseoError) console.error(err);
    //     resolve(undefined);
    //   }
    // })
  } catch(err) {
    console.log("getTranslations error 2", err);
    if (window.shouldConsoleglobalseoError) console.error(err);
  }
}

if (isBrowser()) {
  if (!window.globalseoUtils) {
     window.globalseoUtils = {}
  }
  window.globalseoUtils.isBrowser = isBrowser;
  window.globalseoUtils.getTranslations = getTranslations;
  window.globalseoUtils.createLanguageSelect = createLanguageSelect;
  window.globalseoUtils.getLanguageFromLocalStorage = getLanguageFromLocalStorage;
  window.globalseoUtils.setOptions = setOptions
  window.globalseoUtils.extractOptionsFromScript = extractOptionsFromScript;
  window.globalseoUtils.replaceLinks = replaceLinks;
  window.globalseoUtils.renderSelectorState = renderSelectorState;
}

module.exports.isBrowser = isBrowser;
module.exports.getTranslations = getTranslations;
module.exports.createLanguageSelect = createLanguageSelect;
module.exports.getLanguageFromLocalStorage = getLanguageFromLocalStorage;
module.exports.setOptions = setOptions;
module.exports.extractOptionsFromScript = extractOptionsFromScript;
module.exports.replaceLinks = replaceLinks;
module.exports.renderSelectorState = renderSelectorState;
