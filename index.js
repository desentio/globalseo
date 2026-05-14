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
                if (target?.closest && target.closest('.globalseo-lang-selector-wrapper')) return true;
                const className = target?.className || "";
                return typeof className === "string" && (className.includes("globalseo-lang-selector-value") || className.includes("weploy-lang-selector-value"));
              } catch(err) {
                return false;
              }
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

          // Set up observer configuration: what to observe
          const config = { childList: true, subtree: true };

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
