const { getTranslations, isBrowser } = require("./index.js");

if (isBrowser()) {
  const search = window.location.search;
  const params = new URLSearchParams(search);
  const paramsLang = params.get('lang');
  const paramsUpdateTranslation = params.get('weploy_update_translation');

  // console.log(process.env.NO_CACHE)
  function replaceLinks(lang) {
    // Select all anchor tags
    let anchors = document.querySelectorAll('a');
  
    // Loop through all anchor tags
    for (let i = 0; i < anchors.length; i++) {
        let anchor = anchors[i];
  
        // Check if the link is internal
        if (anchor.hostname === window.location.hostname) {
            // Create a new URL object
            let url = new URL(anchor.href);
  
            // Set the search parameter "lang" to lang
            url.searchParams.set('lang', lang);
  
            // Update the href of the anchor tag
            anchor.href = url.href;
        }
    }
  }

  window.weployScriptTag = document.currentScript;

  const translationCache = window.localStorage.getItem("translationCachePerPage");
  try {
    const parsedTranslationCache = JSON.parse(translationCache);
    if (parsedTranslationCache && typeof parsedTranslationCache === "object") {
      window.translationCache = parsedTranslationCache;
    }
  } catch (e) {
    console.log("Error parsing translation cache", e)
  }

  const customLanguageCodeAttr = window.weployScriptTag.getAttribute("data-custom-language-code"); // format is "kk=kz, en=us, ru=rs"
  const customLanguageCode = customLanguageCodeAttr ? customLanguageCodeAttr.split(",").reduce((acc, lang) => {
    const [key, value] = lang.trim().split("=");
    if (!key || !value) return acc;

    acc[key] = value;
    return acc;
  }, {}) : {};

  // get options
  const apiKey = window.weployScriptTag.getAttribute("data-weploy-key");

  // defined languages so dont need extra fetch
  const originalLangAttr = window.weployScriptTag.getAttribute("data-original-language") || window.weployScriptTag.getAttribute("data-original-lanugage");
  const originalLang = (originalLangAttr || "").trim().toLowerCase();

  const activeLang = paramsLang || originalLang;
  if (document.documentElement.lang != activeLang) {
    document.documentElement.lang = activeLang;
  }

  const allowedLangAttr = window.weployScriptTag.getAttribute("data-allowed-languages");
  const allowedLangs = (allowedLangAttr || "").trim().toLowerCase().split(",").filter(lang => !!lang).map(lang => lang.trim());

  // this is backward compatibility for use browser language
  const disableAutoTranslateAttr = window.weployScriptTag.getAttribute("data-disable-auto-translate");
  const disableAutoTranslate = disableAutoTranslateAttr == "true";
  const useBrowserLanguageAttr = window.weployScriptTag.getAttribute("data-use-browser-language");
  const useBrowserLanguage = useBrowserLanguageAttr != "false" && useBrowserLanguageAttr != false;

  // exclude classes
  const excludeClassesAttr = (window.weployScriptTag.getAttribute("data-exclude-classes") || "").trim()
  const excludeClassesByComma = excludeClassesAttr.split(",").filter(className => !!className).map(className => className.trim());
  const excludeClassesBySpace = excludeClassesAttr.split(" ").filter(className => !!className).map(className => className.trim().replaceAll(",", ""));
  const mergedExcludeClasses = [...excludeClassesByComma, ...excludeClassesBySpace];
  const excludeClasses = [...new Set(mergedExcludeClasses)]; // get unique values

  // timeout
  const timeoutAttr = window.weployScriptTag.getAttribute("data-timeout");
  const timeout = isNaN(Number(timeoutAttr)) ? 0 : Number(timeoutAttr);

  const createSelector = window.weployScriptTag.getAttribute("data-auto-create-selector") != "false";

  const translateAttributes = window.weployScriptTag.getAttribute("data-translate-attributes") == "true";

  const dynamicTranslation = paramsUpdateTranslation == "true" || (window.weployScriptTag.getAttribute("data-dynamic-translation") != "false");

  const translateSplittedText = window.weployScriptTag.getAttribute("data-translate-splitted-text") == "true";

  const shouldReplaceLinks = window.weployScriptTag.getAttribute("data-replace-links") != "false";

  const options = {
    useBrowserLanguage: !disableAutoTranslate && useBrowserLanguage,
    createSelector: createSelector,
    excludeClasses,
    originalLanguage: originalLang,
    allowedLanguages: allowedLangs,
    timeout: timeout,
    customLanguageCode,
    translateAttributes,
    dynamicTranslation,
    translateSplittedText
  }

  function initWeploy() {
    // replace links with lang (for SEO purposes)
    if (shouldReplaceLinks && paramsLang && (paramsLang != originalLang)) {
      replaceLinks(paramsLang);
    }
    getTranslations(apiKey, options)
  }

  // console.log("document.readyState", document.readyState)
  if (document.readyState == 'complete') {
    // DOM is already loaded, run the code
    initWeploy();
  } else {
    // DOM is not loaded yet, wait for it
    document.addEventListener("DOMContentLoaded", function() {
      initWeploy();
    });
  }
}
