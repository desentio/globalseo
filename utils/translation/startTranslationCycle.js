const { getGlobalseoActiveLang, getGlobalseoOptions, isBrowser } = require("../configs");
const { getLanguageFromLocalStorage } = require("../languages/getSelectedLanguage");
const modifyHtmlStrings = require("./modifyHtmlStrings");
const { debounce } = require("../debounce");
const { renderSelectorState } = require("../selector/renderSelectorState");
const { isExcludedPath } = require("./isExcluded");
const getUnprefixedPathname = require("../translation-mode/getUnprefixedPathname");

// the goal is to limit the number of promises that can be run at the same time
// startTranslationCycleInProgress -> startTranslationCycleNext -> if there is another startTranslationCycle, it will replace the startTranslationCycleNext so the previous promise will never be called, and the latest one will be called once the in progress promise is finished
async function startTranslationCycle(...args) {
  // if run on server, just run normally
  if (!isBrowser()) {
    return startTranslationCycleBase(...args);
  }

  
  const promiseFunction = () => startTranslationCycleBase(...args).finally(() => {
    if (window.startTranslationCycleNext) {
      window.startTranslationCycleInProgress = window.startTranslationCycleNext();
      window.startTranslationCycleNext = null;
    } else {
      window.startTranslationCycleInProgress = null;
    }
  });
  if (window.startTranslationCycleInProgress) {
    window.startTranslationCycleNext = promiseFunction;
  } else {
    window.startTranslationCycleInProgress = promiseFunction();
  }
}

async function startTranslationCycleBase(window, node, apiKey, delay, shouldOptimizeSEO = false) {
  if (window.preventInitialTranslation) {
    window.preventInitialTranslation = false;
    return;
  };
  const options = getGlobalseoOptions(window);

  if (isExcludedPath(window)) {
    renderSelectorState(window, { shouldUpdateActiveLang: true, delay: 0, shouldLog: false })
    return window;
  }

  if (!window.isWorker && options.translationMode == "subdomain") {      
    await renderSelectorState(window, { shouldUpdateActiveLang: true, delay: 0, shouldLog: false })

    // dont translate anything on original site
    if (!window.activeSubdomain) {
      return window;
    } else {
      window.globalseoActiveLang = window.activeSubdomain;
    }
  }

  // replace src because nextjs will replace the whole html on rerender
  if (options.translationMode == "subdomain" && window.activeSubdomain) {
    // get all elements with src attribute
    ["src", "srcset"].forEach(attr => {
      try {
        const elements = window.document.querySelectorAll(`[${attr}]`);

        const elementsWithRelativeSrc = Array.from(elements).filter(el => {
          const srcAttribute = el.getAttribute(attr);
          return !srcAttribute.startsWith("http")
        });

        // get the original website (based on current subdomain url but without the subdomain)
        const originalWebsite = window.location.origin.replace(window.activeSubdomain + ".", "");
        const originalWebsiteHostname = new URL(originalWebsite).hostname;

        // replace the hostname of the src with the original hostname
        elementsWithRelativeSrc.forEach(el => {
          if (attr == "srcset") {
             // handle srcset
            const srcset = el.srcset.split(", ");
            const newSrcset = srcset.map(src => {
              const [srcUrl, srcWidth] = src.split(" ");
              const url = new URL(srcUrl, window.location.origin);
              url.hostname = originalWebsiteHostname;

              // handle path relative to current pathname (that not starts with slash)
              // if started with slash, it means it's relative to the root
              // meanwhile if it's not started with slash, it means it's relative to the current pathname
              const rawAttribute = el.getAttribute(attr);
              if (options.domainSourcePrefix && !rawAttribute.startsWith("/")) {
                url.pathname = `${options.domainSourcePrefix}${url.pathname}`;
              }

              return `${url.href} ${srcWidth}`;
            }).join(", ");
            el.srcset = newSrcset;
          } else {
            const url = new URL(el[attr]);
            url.hostname = originalWebsiteHostname;

            // handle path relative to current pathname (that not starts with slash)
              // if started with slash, it means it's relative to the root
              // meanwhile if it's not started with slash, it means it's relative to the current pathname
            const rawAttribute = el.getAttribute(attr);
            if (options.domainSourcePrefix && !rawAttribute.startsWith("/")) {
              url.pathname = `${options.domainSourcePrefix}${url.pathname}`;
            }

            el[attr] = url.href;
          }
        })
      } catch(err) {
        // do nothing
      }      
    })


    // replace all internal links behavior to force reload using window.location.href
    const links = window.document.querySelectorAll("a");
    links.forEach(link => {
      try {
        const href = link.href;
        const url = new URL(href);
        const origin = url.origin;
        
        if (options.domainSourcePrefix) {
          url.pathname = getUnprefixedPathname(window, options.domainSourcePrefix, url.pathname);
        }
        const isHashTagInSamePathname = url.href ? (url.pathname == window.location.pathname) && url.href.includes("#") : false;
        
        if (origin == window.location.origin && !isHashTagInSamePathname) {
          // add onclick
          link.onclick = (e) => {
            e.preventDefault();
            window.location.href = href;

            return true;
          }
        }
      } catch(err) {
        // do nothing
      }      
    })
  }

  // replace src and srcset because nextjs will replace the whole html on rerender for subdirectory mode
  if (options.translationMode == "subdirectory" && window.activeSubdirectory) {    // get all elements with src attribute
    ["src", "srcset"].forEach(attr => {
      try {
        const elements = window.document.querySelectorAll(`[${attr}]`);
        const elementsWithRelativeSrc = Array.from(elements).filter(el => {
          const srcAttribute = el.getAttribute(attr);
          return !srcAttribute.startsWith("http")
        });

        const originalWebsiteHostname = new URL(options.sourceOrigin).hostname;

        elementsWithRelativeSrc.forEach(el => {
          if (attr == "srcset") {
            // handle srcset
            const srcset = el.getAttribute(attr).split(", ");
            const newSrcset = srcset.map(src => {
              const [srcUrl, srcWidth] = src.split(" ");
              const url = new URL(srcUrl, options.sourceOrigin || window.location.origin);
              url.hostname = originalWebsiteHostname;

              // handle path relative to current pathname (that not starts with slash)
              // if started with slash, it means it's relative to the root
              // meanwhile if it's not started with slash, it means it's relative to the current pathname
              const rawAttribute = el.getAttribute(attr);
              if (options.domainSourcePrefix && !rawAttribute.startsWith("/")) {
                url.pathname = `${options.domainSourcePrefix}${url.pathname}`;
              }

              return `${url.href} ${srcWidth}`;
            }).join(", ");
            el.srcset = newSrcset;
          } else {
            const url = new URL(el.getAttribute(attr), options.sourceOrigin || window.location.origin);
            url.hostname = originalWebsiteHostname;

            // handle path relative to current pathname (that not starts with slash)
              // if started with slash, it means it's relative to the root
              // meanwhile if it's not started with slash, it means it's relative to the current pathname
            const rawAttribute = el.getAttribute(attr);
            if (options.domainSourcePrefix && !rawAttribute.startsWith("/")) {
              url.pathname = `${options.domainSourcePrefix}${url.pathname}`;
            }

            el[attr] = url.href;
          }
        })
      } catch(err) {
        // do nothing
      }
    })

     // replace all internal links behavior to force reload using window.location.href
     const links = window.document.querySelectorAll("a");
     links.forEach(link => {
       try {
         const href = link.href;
         const url = new URL(href);
         const origin = url.origin;
         
         if (options.domainSourcePrefix) {
           url.pathname = getUnprefixedPathname(window, options.domainSourcePrefix, url.pathname);
         }
         const isHashTagInSamePathname = url.href ? (url.pathname == window.location.pathname) && url.href.includes("#") : false;
         
         if (origin == window.location.origin && !isHashTagInSamePathname) {
           // add onclick
           link.onclick = (e) => {
             e.preventDefault();
             window.location.href = href;
 
             return true;
           }
         }
       } catch(err) {
         // do nothing
       }      
     })
  }

  const lang = options?.translationMode == "subdomain" && !window.isWorker ? getGlobalseoActiveLang(window) : (window.paramsLang || getGlobalseoActiveLang(window) || await getLanguageFromLocalStorage(window));
  const originalLang = options?.originalLanguage;

  if (!window.langHistory) {
    window.langHistory = [] // example: [["en", "de"], ["de", "de"], ["de", "id"]]
  }

  if (!window.langHistory.length) {
    window.langHistory.push([originalLang, lang])
  } else {
    const latestLang = window.langHistory[window.langHistory.length - 1][1];
    window.langHistory.push([latestLang, lang])
    // if (latestLang != lang) {
    //   window.langHistory.push([latestLang, lang])
    // }
  }

  // console.log("startTranslationCycle getGlobalseoActiveLang", getGlobalseoActiveLang(window), isBrowser())
  // console.log("startTranslationCycle", "globalseo start translation", delay)

  return await new Promise((resolve) => {
    // execute the first translation attempt immediately
    if (
      window.isWorker
      || (!delay && !window.isTranslationRunOnce)
      || (window.activeSubdomain && window.translationCache?.[window.location.pathname]?.[window.activeSubdomain])
    ) {
      // console.log("RUN FIRST")
      window.isTranslationRunOnce = true;
      modifyHtmlStrings(window, node, lang, apiKey, shouldOptimizeSEO).catch(console.log).finally(() => {
        // console.log("FINALLY")
        resolve(undefined)
      })
    } else {
      debounce(window, async () => {
        modifyHtmlStrings(window, node, lang, apiKey, shouldOptimizeSEO).catch(console.log).finally(() => { 
          // console.log("FINALLY 2")
          resolve(undefined)
        });
        // disable debounce if cache found
      }, (delay || 1))(); // must have at least 1 milisecond to prevent browser hanging in super fast rerender condition (rare extreme case)
    }
  })
  
  // window.cacheAlreadyChecked = true;
}

module.exports = startTranslationCycle;
