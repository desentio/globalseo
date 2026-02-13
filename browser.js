const extractOptionsFromScript = require("./extractOptionsFromScript.js");
const { getTranslations, isBrowser } = require("./index.js");
const replaceLinks = require("./replaceLinks.js");
const { PREV_SCRIPT_VERSION } = require("./utils/configs.js");
// const { checkPage } = require("./utils/translation/checkPage.js");

if (isBrowser()) {
  try {
    // prevent multiple scripts execution
    if (window.firstGlobalseoScriptExecuted) throw new Error("Script already executed");
    window.firstGlobalseoScriptExecuted = true;

    window.translationScriptTag = window.document.currentScript;
    window.translationScriptPrevVersion = PREV_SCRIPT_VERSION // called prev version because it will bumped after published to npm

    const options = extractOptionsFromScript(window)
    const {shouldReplaceLinks, langParam, paramsLang, originalLanguage, apiKey, translationMode} = options
    // shouldReplaceLinks,
    //   paramsLang,
    //   apiKey

    function initTranslation() {
      // replace links with lang (for SEO purposes)
      if (translationMode != 'subdomain' && translationMode != 'subdirectory' && translationMode != 'domain' && shouldReplaceLinks && paramsLang && (paramsLang != originalLanguage)) {
        replaceLinks(window, {langParam, lang: paramsLang, translationMode: options.translationMode, sourceOrigin: options.sourceOrigin});
      }
      getTranslations(window, apiKey, options)
    }

    // console.log("window.document.readyState", window.document.readyState)
    if (window.document.readyState == 'interactive' || window.document.readyState == 'complete') {
      // DOM is already loaded, run the code
      initTranslation();
    } else {
      // DOM is not loaded yet, wait for it
      window.document.addEventListener("DOMContentLoaded", function() {
        initTranslation();
      });
    }
  } catch (error) {
    // console.log("GLOBALSEO:", error);
  }
}

// initialize new event "pathnamechange"
if (isBrowser()) {
  (() => {
    let oldPushState = history.pushState;
    history.pushState = function pushState() {
        let ret = oldPushState.apply(this, arguments);
        window.dispatchEvent(new Event('pushstate'));
        if (window.location.pathname != window.currentPathname) {
          window.dispatchEvent(new Event('pathnamechange'));
          window.currentPathname = window.location.pathname
        }
        return ret;
    };
  
    let oldReplaceState = history.replaceState;
    history.replaceState = function replaceState() {
        let ret = oldReplaceState.apply(this, arguments);
        window.dispatchEvent(new Event('replacestate'));
        if (window.location.pathname != window.currentPathname) {
          window.dispatchEvent(new Event('pathnamechange'));
          window.currentPathname = window.location.pathname
        }
        return ret;
    };
  
    window.addEventListener('popstate', () => {
        if (window.location.pathname != window.currentPathname) {
          window.dispatchEvent(new Event('pathnamechange'));
          window.currentPathname = window.location.pathname
        }
    });
  })();
}