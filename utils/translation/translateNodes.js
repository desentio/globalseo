const { isCompressionSupported } = require("../compressions");
const { isBrowser, getGlobalseoOptions, isUntranslatedValue, getIsTranslationInitialized, DEFAULT_UNTRANSLATED_VALUE } = require("../configs");
const { renderSelectorState } = require("../selector/renderSelectorState");
const getCacheKey = require("./getCacheKey");
const getTagName = require("./getTagName");
const getTranslationCacheFromCloudflare = require("./getTranslationCacheFromCloudflare");
const getTranslationsFromAPI = require("./getTranslationsFromAPI");
const isStillSameLang = require("./isStillSameLang");
const setLocalStorageExpiration = require("./setLocalStorageExpiration");
const updateNode = require("./updateNode");

function translateNodes(window, textNodes = [], language = "", apiKey = "", seoNodes = [], otherNodes = []) {
  // console.log("LANGUGEE", language)
  // dont translate google translate
  if (isBrowser() && (window.document.querySelector('html.translated-ltr') || window.document.querySelector('html.translated-rtl'))) {
    return new Promise((resolve, reject) => {
      reject("Google translate is already translating")
    })
  };
  
  // dont translate original language
  const options = getGlobalseoOptions(window)
  const langs = options.definedLanguages;
  // console.log("globalseo langs", language, window.globalseoActiveLang, langs)
  if (langs && langs[0] && langs[0].lang == language.substring(0, 2).toLowerCase()) {
    // console.log("Original language is not translatable");
    return new Promise((resolve) => {
      // console.log("Original language is not translatable");
      resolve(undefined);
      // reject("Original language is not translatable");
    })
  }
  return new Promise((resolve) => {
    // Remove empty strings & unmatched context
    const cleanTextNodes = textNodes.filter(
      (textNode) => {
        const trimmed = (typeof textNode.textContent === "string" && textNode.textContent.trim()) || "";
        const isNotEmpty = !!trimmed;

        const isTextContentIsInContext = textNode.context && typeof textNode.context == 'string' ? 
          textNode.context.includes(trimmed) :
          true;
          
        return isNotEmpty && isTextContentIsInContext;
      }
    );

    // Initialize cache if not exist yet
    if (!window.translationCache) {
      window.translationCache = {}
    }

    // Initialize cache per page if not exist yet
    if (!window.translationCache?.[window.location.pathname]) {
      window.translationCache[window.location.pathname] = {};
    }

    // Initialize language cache if not exist yet
    if (!window.translationCache?.[window.location.pathname]?.[language]) {
      window.translationCache[window.location.pathname][language] = {};
    }

    // Initialize cache for untranslated text
    if (!window.untranslatedCache) {
      window.untranslatedCache = {}
    }

    // Initialize cache per page for untranslated text if not exist yet
    if (!window.untranslatedCache?.[window.location.pathname]) {
      window.untranslatedCache[window.location.pathname] = {};
    }

    // Initialize language cache for untranslated text if not exist yet
    if (!window.untranslatedCache?.[window.location.pathname]?.[language]) {
      window.untranslatedCache[window.location.pathname][language] = {};
    }

    let notInCache = [];

    // Check cache for each textNode
    cleanTextNodes.forEach((node) => {
      const originalTextFromServer = !window.isWorker ? node.parentNode.getAttribute("data-original-text") : undefined;
      const text = originalTextFromServer || getCacheKey(window, node);
      const tagName = getTagName(window, node);
      const context = node.context;

      // const cacheValues = Object.values(window.translationCache?.[window.location.pathname]?.[language] || {});
      // const allTranslationValuesInAllPages = Object.values(window.translationCache).map(x => Object.values(x[language] || {}))
      // const allTranslationValuesInAllPages = [] // replaced with originalText

      const cache = window.translationCache?.[window.location.pathname]?.[language]?.[text]
      // console.log("allTranslationValuesInAllPages", allTranslationValuesInAllPages)
      if (
        !cache
        // && !allTranslationValuesInAllPages.includes(text) // check in value (to handle nodes that already translated)
      ) {
        notInCache.push({ text, tagName, context }); // If not cached, add to notInCache array
      } else {
        updateNode(window, node, language, "text", 1)
      }
    });

    seoNodes.forEach((node) => {
      const allTranslationValuesInAllPages = Object.values(window.translationCache).map(x => Object.values(x[language] || {}))
      // const allTranslationValuesInAllPages = [] // replaced with originalText

      if (node == window.document) {
        const cache = window.translationCache?.[window.location.pathname]?.[language]?.[window.document.title]
        if (
          !cache && !allTranslationValuesInAllPages.includes(window.document.title)
        ) {
          if ((window.document.title || "").trim()) notInCache.push(window.document.title); // make sure the title is not empty
        } else {
          updateNode(window, node, language, "seo", 2)
        }
      }

      if (node.tagName == "META") {
        const cache = window.translationCache?.[window.location.pathname]?.[language]?.[node.content]
        if (
          !cache && !allTranslationValuesInAllPages.includes(node.content)
        ) {
          notInCache.push(node.content);
        } else {
          updateNode(window, node, language, "seo", 3)
        }
      }

      if (node.tagName == "IMG") {
        const altCache = window.translationCache?.[window.location.pathname]?.[language]?.[node.alt]

        // make sure the alt is not empty
        if (
          (node.alt || "").trim() && !altCache && !allTranslationValuesInAllPages.includes(node.alt)
        ) {
          notInCache.push(node.alt);
        }
        
        const titleCache = window.translationCache?.[window.location.pathname]?.[language]?.[node.title]
        // make sure the title is not empty
        if (
          (node.title || "").trim() && !titleCache && !allTranslationValuesInAllPages.includes(node.alt)
        ) {
          notInCache.push(node.title);
        }

        if (altCache && titleCache) {
          updateNode(window, node, language, "seo", 4);
        }
      }

      if (node.tagName == "A") {
        const titleCache = window.translationCache?.[window.location.pathname]?.[language]?.[node.title]
        // make sure the title is not empty
        if (
          (node.title || "").trim() && !titleCache && !allTranslationValuesInAllPages.includes(node.title)
        ) {
          notInCache.push(node.title);
        }

        if (titleCache) {
          updateNode(window, node, language, "seo", 5);
        }
      }
    });

    otherNodes.forEach((node) => {
      const allTranslationValuesInAllPages = Object.values(window.translationCache).map(x => Object.values(x[language] || {}))

      if (node.tagName == "TEXTAREA" || (node.tagName == "INPUT" && node.type != "button" && node.type != "submit")) {
        const placeholderCache = window.translationCache?.[window.location.pathname]?.[language]?.[node.placeholder]
        // make sure the placeholder is not empty
        if (
          (node.placeholder || "").trim() && !placeholderCache && !allTranslationValuesInAllPages.includes(node.placeholder)
        ) {
          notInCache.push(node.placeholder);
        }

        if (placeholderCache) {
          updateNode(window, node, language, "form", 5.2);
        }
      }

      if(node.tagName == "INPUT" && (node.type == "button" || node.type == "submit")) {
        const valueCache = window.translationCache?.[window.location.pathname]?.[language]?.[node.value]
        // make sure the value is not empty
        if (
          (node.value || "").trim() && !valueCache && !allTranslationValuesInAllPages.includes(node.value)
        ) {
          notInCache.push(node.value);
        }

        if (valueCache) {
          updateNode(window, node, language, "form", 5.20);
        }
      }

      if(node.tagName == "OPTION") {
        const cache = window.translationCache?.[window.location.pathname]?.[language]?.[node.textContent]
        if (
          !cache && !allTranslationValuesInAllPages.includes(node.textContent)
        ) {
          notInCache.push(node.textContent);
        }

        if (cache) {
          updateNode(window, node, language, "form", 5.21);
        }
      }
    })

    // console.log("globalseo texts", notInCache);
    // console.log("globalseo start getting translations", notInCache.length);
    // return;

    if (notInCache.length > 0) { 
      window.globalseoError = false;
      window.globalseoTranslating = true;
      renderSelectorState(window, { shouldUpdateActiveLang: false });

      // console.log("BEFORE getTranslationCacheFromCloudflare")
      getTranslationCacheFromCloudflare(window, language, apiKey).then((cacheFromCloudFlare) => {
        if (process.env.NO_CACHE) {
          cacheFromCloudFlare = {};
        }
  
        if (isStillSameLang(window, language)) {
          window.translationCache[window.location.pathname][language] = {
            ...(window.translationCache?.[window.location.pathname]?.[language] || {}),
            ...cacheFromCloudFlare
          }
        }
  
        const notCachedInCDN = notInCache.filter((nodeData) => {
          const text = typeof nodeData == 'string' ? nodeData : nodeData?.text;
          return !cacheFromCloudFlare[text]
        });
        // console.log("notCachedInCDN", notCachedInCDN)

        // If there are translations not in cache, fetch them from the API
        const options = getGlobalseoOptions(window);

        return new Promise((resolve) => {
          if (notCachedInCDN.length && options.dynamicTranslation) {
            getTranslationsFromAPI(window, notCachedInCDN, language, apiKey).then((response) => {
              resolve({response, notCachedInCDN, cacheFromCloudFlare});
            })
          } else {
            resolve({response: [], notCachedInCDN, cacheFromCloudFlare});
          }
        })      
      })
      .then(({response, notCachedInCDN, cacheFromCloudFlare}) => {
        notCachedInCDN.map((nodeData, index) => {
          const text = typeof nodeData == 'string' ? nodeData : nodeData?.text;

          // Cache the new translations
          if (isStillSameLang(window, language) && window.translationCache?.[window.location.pathname]?.[language]) {
            window.translationCache[window.location.pathname][language][text] = response[index] || cacheFromCloudFlare[text] || text;
          }

          // If the translation is not available, cache the original text
          if (isStillSameLang(window, language) && isUntranslatedValue(window.translationCache?.[window.location.pathname]?.[language]?.[text] || "")) {
            window.translationCache[window.location.pathname][language][text] = DEFAULT_UNTRANSLATED_VALUE;
            window.untranslatedCache[window.location.pathname][language][text] = true;
          }
        });

        // Update textNodes from the cache
        cleanTextNodes.forEach((node) => {
          updateNode(window, node, language, "text", 6)
        });

        seoNodes.forEach((node) => {
          updateNode(window, node, language, "seo", 7)
        });
        
        if (isBrowser() && isStillSameLang(window, language)) {
          setLocalStorageExpiration(window);
          window.localStorage.setItem("translationCachePerPage", JSON.stringify(window.translationCache));
        }

        // console.log("globalseo translations done", notInCache.length);
        resolve(undefined);
      }).catch(() => {
        // console.error(err); // Log the error and resolve the promise without changing textNodes
        // console.log("globalseo translations error", notInCache.length);
        resolve(undefined);
      });
    } else {
      // If all translations are cached, directly update textNodes from cache
      cleanTextNodes.map((node) => {
        const text = getCacheKey(window, node);

        // If the translation is not available, cache the original text
        if (isStillSameLang(window, language) && isUntranslatedValue(window.translationCache?.[window.location.pathname]?.[language]?.[text] || "")) {
          window.translationCache[window.location.pathname][language][text] = DEFAULT_UNTRANSLATED_VALUE;
          window.untranslatedCache[window.location.pathname][language][text] = true;
        }

        updateNode(window, node, language, "text", 8);

        seoNodes.forEach((node) => {
          updateNode(window, node, language, "seo", 9)
        });

      });

      if (isBrowser() && !getIsTranslationInitialized(window) && isStillSameLang(window, language)) {
        setLocalStorageExpiration(window);
        window.localStorage.setItem("translationCachePerPage", JSON.stringify(window.translationCache));
      }
      resolve(undefined);
    }
  });
}

module.exports = translateNodes;
