const { isBrowser, getWeployOptions, setWeployOptions, setWeployActiveLang, setIsTranslationInitialized, getIsTranslationInitialized, shouldTranslateInlineText, getWeployActiveLang } = require('./utils/configs.js');
const checkIfTranslatable = require('./utils/translation/checkIfTranslatable.js');
const allWeployLanguagesList = require('./utils/languages/allWeployLanguagesList.js');
const { fetchLanguageList } = require('./utils/languages/fetchLanguageList.js');
const { createLanguageSelect, addOrReplaceLangParam } = require('./utils/selector/createLanguageSelect.js');
const { getLanguageFromLocalStorage, getSelectedLanguage } = require('./utils/languages/getSelectedLanguage.js');
const delay = require('./utils/delay.js');
const { debounce } = require('./utils/debounce.js');
const extractTextNodes = require('./utils/translation/extractTextNodes.js');
const getTranslationsFromAPI = require('./utils/translation/getTranslationsFromAPI.js');
const { renderWeploySelectorState } = require('./utils/selector/renderWeploySelectorState.js');
const getTranslationCacheFromCloudflare = require('./utils/translation/getTranslationCacheFromCloudflare.js');
const { isCompressionSupported } = require('./utils/compressions.js');
const isUrl = require('./utils/translation/isUrl.js');

var isDomListenerAdded;

if (isBrowser()) {
  if (!window.translationCache) {
    window.translationCache = {};
  }
  window.currentPathname = window.location.pathname
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

async function setLocalStorageExpiration() {
  // get the current date
  const now = new Date();

  // get the current date timestamp
  const nowTimestamp = now.getTime();

  // expiration in 24 hours
  const expiration = nowTimestamp + (24 * 60 * 60 * 1000);

  // get weployExpirationTimestamp from localStorage
  const weployExpirationTimestamp = await window.localStorage.getItem("weployExpirationTimestamp");
  const timestamp = Number(weployExpirationTimestamp);

  // if weployExpirationTimestamp is not set or not valid or already expired, set it to the current date timestamp
  if (isNaN(timestamp) || timestamp < nowTimestamp) {
    window.localStorage.setItem("weployExpirationTimestamp", String(expiration));
  }
}

function isUntranslatableAndNotFetched(cache, language, text) {
  return false;
  const isAlreadyFetched = window.untranslatedCache?.[window.location.pathname]?.[language]?.[text];
  const isUntranslated = cache == "weploy-untranslated";
  // if (isUntranslated) console.log("DEBUG", text, cache, isUntranslated, isAlreadyFetched);
  return isUntranslated && !isAlreadyFetched;
}

function getCacheKey(node) {
  return shouldTranslateInlineText() ? node.cacheKey || node.textContent : node.textContent;
}

function getTagName(node) {
  const translateInline = shouldTranslateInlineText()
  if (translateInline) {
    return node.topLevelTagName || node.parentTagName
  } else {
    return node.parentTagName;

    // another logic: if it's inline, dont include tagname because <h1>Hello <b>World</b></h1> could result into <h1>Hello</h1> and <b>World</b>
    // if (node.fullTextArray) {
    //   return undefined
    // } else {
    //   return node.parentTagName;
    // }
  }
}

function updateNode(node, language, type = "text", debugSource) {
  // console.log("update node", debugSource, node, node.textContent, language);

  // update title
  if (node == document) {
    const newText = window.translationCache?.[window.location.pathname]?.[language]?.[document.title] || "";  
    if (newText && !newText.includes("weploy-untranslated")) {
      document.title = newText;
    }
    return;
  }

  // update meta tags
  if (node.tagName == "META") {
    const newText = window.translationCache?.[window.location.pathname]?.[language]?.[node.content] || "";  
    if (newText && !newText.includes("weploy-untranslated")) {
      node.content = newText;
    }
    return;
  }

  // update image
  if (node.tagName == "IMG") {
    const newAlt = window.translationCache?.[window.location.pathname]?.[language]?.[node.alt] || "";
    const newTitle = window.translationCache?.[window.location.pathname]?.[language]?.[node.title] || "";

    if (newAlt && !newAlt.includes("weploy-untranslated")) {
      node.alt = newAlt;
    }

    if (newTitle && !newTitle.includes("weploy-untranslated")) {
      node.title = newTitle;
    }
    return;
  }

  // update anchor title
  if (type == "seo" && node.tagName == "A") {
    const newTitle = window.translationCache?.[window.location.pathname]?.[language]?.[node.title] || "";
    if (newTitle && !newTitle.includes("weploy-untranslated")) {
      node.title = newTitle;
    }
    return;
  }

  const fullTextArray = node.fullTextArray;
  const text = node.textContent;
  const cache = getCacheKey(node);
  // console.log("CACHE", debugSource, cache, node.textContent)
  // console.log(debugSource, window.translationCache?.[window.location.pathname]?.[language])
  const newText = window.translationCache?.[window.location.pathname]?.[language]?.[cache] || "";

  // if (node.textContent == "Cost-efficient" || text == "Cost-efficient") {
  //   console.log("Cost-efficient",
  //     fullText,
  //     fullTextArray,
  //     text,
  //     cache,
  //     newText
  //   )
  // }

  if (cache.includes("weploy-merge") && fullTextArray) {
    // if (node.textContent == "Cost-efficient" || text == "Cost-efficient") {
    //   console.log("Cost-efficient weploy-merge");
    // }

    try {
      const parsedNewText = JSON.parse(newText);
      const translatedObject = typeof parsedNewText == 'string' ? JSON.parse(parsedNewText) : parsedNewText;

      const currentIndex = node.fullTextIndex;
      const isCurrentIndexTheLastIndex = currentIndex == (fullTextArray.length - 1);
      if (translatedObject.translatedText && translatedObject.translatedMap) {
        // console.log("node.textContent translatedObject", translatedObject)
        const translatedText = translatedObject.translatedText; // format: string
        const translatedMap = translatedObject.translatedMap; // format { "originalText": "translatedText" }
        const translatedDir = translatedObject.translatedDir || "ltr";
        const keys = Object.keys(translatedMap).sort((a, b) => b.length - a.length);
        const pattern = keys.map(key => {
          const translatedKey = translatedMap[key];
          return translatedKey.replace(/([()])/g, '\\$1');
        }).join('|');
        const regex = new RegExp(`(${pattern})`, 'g');
        // console.log("node.textContent regex", regex)
        const splitted = translatedText.split(regex);
        // console.log("node.textContent splitted", splitted)

        // merge the falsy value into the previous string
        const mergedSplitted = splitted.reduce((acc, curr, index) => {
          if (typeof curr != 'string') {
            // console.log("node.textContent typeof curr != 'string'", curr)
            return acc;
          }

          if (typeof curr == 'string' && !curr.trim()) {
            // console.log("node.textContent typeof curr == 'string' && !curr.trim()", curr)
            acc[acc.length - 1] += curr;
            return acc;
          }

          return [...acc, curr];
        }, []);
        // console.log("node.textContent mergedSplitted", mergedSplitted)

        const mergedOrphanString = mergedSplitted.reduce((acc, curr, index) => {
          const findTranslationKey = Object.entries(translatedMap).find(([key, value], ) => {
            const isFirstIndex = index == 0;
            const isLastIndex = index == mergedSplitted.length - 1;
            const isFirstOrLast = isFirstIndex || isLastIndex;

            // trim first or last because sometimes the translation key has extra space but the full translation doesn't have it
            // TODO: might need to just trim all because the AI can produce weird extra space in the middle too
            const valueToCompare = isFirstOrLast ? value.trim() : value;
            const matched = curr.includes(valueToCompare);
            return matched;
          })?.[0];
          // console.log("node.textContent findTranslationKey", findTranslationKey)
          if (!findTranslationKey) {
            return [
              ...acc,
              { value: curr, index: -1 }
            ];
          }

          const findIndex = fullTextArray.findIndex(key => key.trim() == findTranslationKey.trim());
          // console.log("node.textContent findIndex", findIndex)
          if (findIndex == -1) {
            return [
              ...acc,
              { value: curr, index: -1 }
            ];
          }

          return [
            ...acc,
            { value: curr, index: findIndex }
          ]
        }, []);

        // console.log("node.textContent mergedOrphanString", node.textContent, currentIndex, mergedOrphanString)
  
        const translatedIndex = mergedOrphanString.findIndex(({ index }) => index == currentIndex)
        if (translatedIndex == -1) return;

        let newValue = mergedOrphanString[translatedIndex]?.value;
        // console.log("node.textContent newValue", node.textContent, text, newValue)

        // merge to right
        if (translatedDir == 'ltr') {
          // if the current index is the first index, and there are still some splitted values left, then concat it
          if (currentIndex == 0) {
            newValue = `${mergedOrphanString.slice(0, translatedIndex).map(x => x.value).join(' ')} ${newValue}`
          }
          // console.log("node.textContent currentIndex == 0", node.textContent, text, newValue)

          // find the right newValue, make sure it matched with the text, but start checking from the translatedIndex to the next index
          for (let i = translatedIndex + 1; i < mergedOrphanString.length; i++) {
            if (mergedOrphanString[i].index == -1) {
              newValue = `${newValue} ${mergedOrphanString[i].value}`;
              // console.log("node.textContent mergedOrphanString", mergedOrphanString, i, node.textContent, text, newValue)

            } else {
              break;
            }
          }
        }
        
        // merge to left
        if (translatedDir == 'rtl') {
          // if the current index is the last index, and there are still some splitted values left, then concat it
          if (isCurrentIndexTheLastIndex) {
            newValue = `${newValue} ${mergedOrphanString.slice(translatedIndex + 1, mergedOrphanString.length).map(x => x.value).join(' ')}`
          }
          // console.log("node.textContent isCurrentIndexTheLastIndex", node.textContent, text, newValue)

          // find the right newValue, make sure it matched with the text, but start checking from the translatedIndex to the previous index
          for (let i = translatedIndex - 1; i >= 0; i--) {
            if (mergedOrphanString[i].index == -1) {
              newValue = `${mergedOrphanString[i].value} ${newValue}`;
              // console.log("node.textContent mergedOrphanString", mergedOrphanString, i, node.textContent, text, newValue)

            } else {
              break;
            }
          }
        }

        // make sure text is still the same before replacing
        if (node.textContent == text) {
          // console.log("node.textContent replace", node.textContent, text, newValue)
          node.textContent = newValue; // TODO: right now we only replace based on translation position, later we should swap the node position to preserve the styles
        }
      }
    } catch(err) {
      // do nothing
    }
    return;
  }

  // console.log("oldText", text)
  // console.log("newText", newText)
  // console.log("cache", cache)
  // console.log("node.textContent", node.textContent == text, node.textContent)
  if(newText && !newText.includes("weploy-untranslated")) {
    // if (node.textContent == "Willkommen im Supermarkt" || text == "Willkommen im Supermarkt") {
    //   console.log("Willkommen im Supermarkt normal", node.textContent == text, node.textContent, text, newText)
    // }
    // console.log("isTextStillTheSame", node.textContent == text)
    // make sure text is still the same before replacing
    if(node.textContent == text) {
      node.textContent = newText;
    }
  }
}

function filterValidTextNodes(textNodes) {
  return textNodes.filter((textNode) => {
    const textContent = textNode.textContent
    const isTextContentTranslatable = Array.isArray(textNode.fullTextArray) && textNode.fullTextArray.length ? true : checkIfTranslatable(textContent) != "inValid"

    // node that has no fullTextArray will always return true
    const isFullTextArrayTranslatable = Array.isArray(textNode.fullTextArray) && textNode.fullTextArray.length ? !textNode.fullTextArray.every(singleText => checkIfTranslatable(singleText) == "inValid") : true;
    // console.log("textContent", textContent, isTextContentTranslatable, isFullTextArrayTranslatable, Array.isArray(textNode.fullTextArray) && textNode.fullTextArray.length)

    return isTextContentTranslatable && isFullTextArrayTranslatable;
  });
}

function isStillSameLang(language) {
  // return true;
  const options = getWeployOptions();
  const search = window.location.search;
  const params = new URLSearchParams(search);
  const activeLang = params.get(options.langParam || 'lang');
  if (!activeLang) return true;

  if (activeLang != language) {
    return false;
  } else {
    return true;
  }
}

function translateNodes(textNodes = [], language = "", apiKey = "", seoNodes = []) {
  // console.log("LANGUGEE", language)
  // dont translate google translate
  if (isBrowser() && (document.querySelector('html.translated-ltr') || document.querySelector('html.translated-rtl'))) {
    return new Promise((resolve, reject) => {
      reject("Google translate is already translating")
    })
  };
  
  // dont translate original language
  const options = getWeployOptions()
  const langs = options.definedLanguages;
  console.log("weploy langs", langs)
  if (langs && langs[0] && langs[0].lang == language.substring(0, 2).toLowerCase()) {
    console.log("Original language is not translatable");
    return new Promise((resolve, reject) => {
      resolve(undefined);
      // reject("Original language is not translatable");
    })
  }
  return new Promise(async (resolve) => {
    // Remove empty strings
    const cleanTextNodes = textNodes.filter(
      (textNode) =>
        typeof textNode.textContent == "string" && !!textNode.textContent.trim()
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
      const text = getCacheKey(node);
      const tagName = getTagName(node);
      const context = node.context;

      // const cacheValues = Object.values(window.translationCache?.[window.location.pathname]?.[language] || {});
      const allTranslationValuesInAllPages = Object.values(window.translationCache).map(x => Object.values(x[language] || {}))

      const cache = window.translationCache?.[window.location.pathname]?.[language]?.[text]
      // console.log("allTranslationValuesInAllPages", allTranslationValuesInAllPages)
      if (
        isUntranslatableAndNotFetched(cache, language, text) ||
        !cache && !allTranslationValuesInAllPages.includes(text) // check in value (to handle nodes that already translated)
      ) {
        notInCache.push({ text, tagName, context }); // If not cached, add to notInCache array
      } else {
        updateNode(node, language, "text", 1)
      }
    });

    seoNodes.forEach((node) => {
      const allTranslationValuesInAllPages = Object.values(window.translationCache).map(x => Object.values(x[language] || {}))

      if (node == document) {
        const cache = window.translationCache?.[window.location.pathname]?.[language]?.[document.title]
        if (
          isUntranslatableAndNotFetched(cache, language, document.title) || 
          !cache && !allTranslationValuesInAllPages.includes(document.title)
        ) {
          if ((document.title || "").trim()) notInCache.push(document.title); // make sure the title is not empty
        } else {
          updateNode(node, language, "seo", 2)
        }
      }

      if (node.tagName == "META") {
        const cache = window.translationCache?.[window.location.pathname]?.[language]?.[node.content]
        if (
          isUntranslatableAndNotFetched(cache, language, node.content) ||
          !cache && !allTranslationValuesInAllPages.includes(node.content)
        ) {
          notInCache.push(node.content);
        } else {
          updateNode(node, language, "seo", 3)
        }
      }

      if (node.tagName == "IMG") {
        const altCache = window.translationCache?.[window.location.pathname]?.[language]?.[node.alt]

        // make sure the alt is not empty
        if (
          isUntranslatableAndNotFetched(altCache, language, node.alt) ||
          (node.alt || "").trim() && !altCache && !allTranslationValuesInAllPages.includes(node.alt)
        ) {
          notInCache.push(node.alt);
        }
        
        const titleCache = window.translationCache?.[window.location.pathname]?.[language]?.[node.title]
        // make sure the title is not empty
        if (
          isUntranslatableAndNotFetched(titleCache, language, node.title) ||
          (node.title || "").trim() && !titleCache && !allTranslationValuesInAllPages.includes(node.alt)
        ) {
          notInCache.push(node.title);
        }

        if (altCache && titleCache) {
          updateNode(node, language, "seo", 4);
        }
      }

      if (node.tagName == "A") {
        const titleCache = window.translationCache?.[window.location.pathname]?.[language]?.[node.title]
        // make sure the title is not empty
        if (
          isUntranslatableAndNotFetched(titleCache, language, node.title) ||
          (node.title || "").trim() && !titleCache && !allTranslationValuesInAllPages.includes(node.title)
        ) {
          notInCache.push(node.title);
        }

        if (titleCache) {
          updateNode(node, language, "seo", 5);
        }
      }
    });

    // console.log("weploy texts", notInCache);
    console.log("weploy start getting translations", notInCache.length);
    // return;

    if (notInCache.length > 0) { 
      window.weployError = false;
      window.weployTranslating = true;
      renderWeploySelectorState({ shouldUpdateActiveLang: false });

      let cacheFromCloudFlare = isCompressionSupported() ? await getTranslationCacheFromCloudflare(language, apiKey) : {};

      if (process.env.NO_CACHE) {
        cacheFromCloudFlare = {};
      }

      if (isStillSameLang(language)) {
        window.translationCache[window.location.pathname][language] = {
          ...(window.translationCache?.[window.location.pathname]?.[language] || {}),
          ...cacheFromCloudFlare
        }
      }

      const notCachedInCDN = notInCache.filter((nodeData) => {
        const text = typeof nodeData == 'string' ? nodeData : nodeData?.text;
        return !cacheFromCloudFlare[text] || cacheFromCloudFlare[text] == "weploy-untranslated"
      });

      // console.log("notCachedInCDN", notCachedInCDN)
      
      try {
        // If there are translations not in cache, fetch them from the API
        const options = getWeployOptions();
        const response = notCachedInCDN.length && options.dynamicTranslation ? await getTranslationsFromAPI(notCachedInCDN, language, apiKey) : [];

        // console.log("RESPONSE", response)

        notCachedInCDN.map((nodeData, index) => {
          const text = typeof nodeData == 'string' ? nodeData : nodeData?.text;

          // Cache the new translations
          if (isStillSameLang(language) && window.translationCache?.[window.location.pathname]?.[language]) {
            window.translationCache[window.location.pathname][language][text] = response[index] || cacheFromCloudFlare[text] || text;
          }

          // If the translation is not available, cache the original text
          if (isStillSameLang(language) && (window.translationCache?.[window.location.pathname]?.[language]?.[text] || "").includes("weploy-untranslated")) {
            window.translationCache[window.location.pathname][language][text] = "weploy-untranslated";
            window.untranslatedCache[window.location.pathname][language][text] = true;
          }
        });

        // Update textNodes from the cache
        cleanTextNodes.forEach((node) => {
          updateNode(node, language, "text", 6)
        });

        seoNodes.forEach((node) => {
          updateNode(node, language, "seo", 7)
        });
        
        if (isBrowser() && isStillSameLang(language)) {
          setLocalStorageExpiration();
          window.localStorage.setItem("translationCachePerPage", JSON.stringify(window.translationCache));
        }

        resolve(undefined);
      } catch(err) {
        // console.error(err); // Log the error and resolve the promise without changing textNodes
        resolve(undefined);
      }
    } else {
      // If all translations are cached, directly update textNodes from cache
      cleanTextNodes.map((node) => {
        const text = getCacheKey(node);

        // If the translation is not available, cache the original text
        if (isStillSameLang(language) && (window.translationCache?.[window.location.pathname]?.[language]?.[text] || "").includes("weploy-untranslated")) {
          window.translationCache[window.location.pathname][language][text] = "weploy-untranslated";
          window.untranslatedCache[window.location.pathname][language][text] = true;
        }

        updateNode(node, language, "text", 8);

        seoNodes.forEach((node) => {
          updateNode(node, language, "seo", 9)
        });

      });

      if (isBrowser() && !getIsTranslationInitialized() && isStillSameLang(language)) {
        setLocalStorageExpiration();
        window.localStorage.setItem("translationCachePerPage", JSON.stringify(window.translationCache));
      }
      resolve(undefined);
    }
  });
}

function modifyHtmlStrings(rootElement, language, apiKey, shouldOptimizeSEO) {
  return new Promise(async (resolve, reject) => {
    const seoNodes = []; // document will represent the title tag, if node == document then the updateNode function will update the title

    if (shouldOptimizeSEO) {
      const metaTags = Array.from(document.getElementsByTagName('meta'));
      const cleanMetaTags = metaTags.filter((meta) =>  {
        if (!(meta.content || "").trim()) return false;

        const validMetaTagNames = ["description", "og:title", "og:description", "twitter:title", "twitter:description"];
        if (!validMetaTagNames.includes(meta.name)) return false;

        const isTheContentAnUrl = isUrl(meta.content);
        if (!isTheContentAnUrl) return false;
        return true;
      });

      const options = getWeployOptions();

      const imgTags = options.translateAttributes ? Array.from(document.getElementsByTagName('img')) : [];
      // only include img tags that has alt or title attribute
      const cleanImgTags = imgTags.filter((img) => 
        (img.alt || "").trim() || 
        (img.title || "").trim()
      );

      const anchorTags = options.translateAttributes ? Array.from(document.getElementsByTagName('a')) : [];
      // only include anchor tags that has title attribute
      const cleanAnchorTags = anchorTags.filter((anchor) => (anchor.title || "").trim());

      seoNodes.push(
        document,
        ...cleanMetaTags,
        ...cleanImgTags,
        ...cleanAnchorTags,
      )
    }

    const textNodes = [];
    extractTextNodes(rootElement, textNodes);

    const validTextNodes = filterValidTextNodes(textNodes) || [];
    // console.log("validTextNodes", validTextNodes)

    // handle a case where nodes already translated but some new texts are not translated yet
    // for example on initial load in homepage: ['good morning'] -> ['guten morgen']
    // then the user go to new route "/about", new dom added: ['guten morgen', 'good afternoon'] (this happen especially in nextjs because the route changes happens in client side)
    // this will ensure only good afternoon is included
    // list all cache values
    const cache = window.translationCache || {};
    const allLangCacheInAllPages = Object.keys(cache).reduce((prevValue, pathname) => {
      const pageCache = cache[pathname]; // { en: {}, de: {}, id: {}}
      Object.keys(pageCache).forEach(lang => {
        if (!prevValue[lang]) {
          prevValue[lang] = {};
        }
        // Exclude keys that start with "weploy-merge"
        const filteredPageCache = Object.keys(pageCache[lang])
          .filter(key => !key.startsWith("weploy-merge"))
          .reduce((obj, key) => {
            obj[key] = pageCache[lang][key];
            return obj;
          }, {});
        prevValue[lang] = {...prevValue[lang], ...filteredPageCache};
      });
      return prevValue;
    }, {});
    const values = Object.values(allLangCacheInAllPages).flatMap(Object.values).filter(Boolean);
    const textNodeThatNotInPrevPage = validTextNodes.filter(x => x.fullTextArray || !values.includes(x.textContent))
    // console.log("textNodeThatNotInPrevPage", textNodeThatNotInPrevPage)

    await translateNodes(textNodeThatNotInPrevPage, language, apiKey, seoNodes).then(() => {
      setIsTranslationInitialized(true);
    }).catch(reject).finally(() => {
      window.weployTranslating = false;
      renderWeploySelectorState();
    });

    resolve(undefined);
  });
}

async function startTranslationCycle(node, apiKey, delay, shouldOptimizeSEO = false) {
  const lang = getWeployActiveLang() || await getLanguageFromLocalStorage();

  return new Promise(async (resolve) => {
    if (!delay) {
      await modifyHtmlStrings(node, lang, apiKey, shouldOptimizeSEO).catch(console.log)
      resolve(undefined)
    } else {
      debounce(async () => {
        await modifyHtmlStrings(node, lang, apiKey, shouldOptimizeSEO).catch(console.log);
        resolve(undefined);
      }, delay)();
    }
  })
  
  // window.cacheAlreadyChecked = true;
}

function getDefinedLanguages(originalLanguage, allowedLanguages = []) {
  if (originalLanguage && allowedLanguages && allowedLanguages.length) {
    const originalLang = allWeployLanguagesList.find(lang => lang.lang == originalLanguage);
    const allowedLangs = allWeployLanguagesList.filter(lang => allowedLanguages.includes(lang.lang));
    const langOptions= [originalLang, ...allowedLangs]

    if (originalLang) {
      return langOptions
    }
  }
}

function setOptions(apiKey, optsArgs) {
  const mappedOpts = {
    ...optsArgs,
    timeout: optsArgs.timeout == null ? 0 : optsArgs.timeout,
    pathOptions: optsArgs.pathOptions || {},
    apiKey,
    excludeClasses: optsArgs.excludeClasses || [],
    excludeContents: optsArgs.excludeContents || [],
    definedLanguages: getDefinedLanguages(optsArgs.originalLanguage, optsArgs.allowedLanguages),
  }

  setWeployOptions(mappedOpts)
  // setWeployActiveLang(mappedOpts?.definedLanguages?.[0]?.lang)
}

async function getTranslations(apiKey, optsArgs = {}) {
  try {
    setOptions(apiKey, optsArgs)

    // save language to local storage & delay 1 second to wait google translate
    await Promise.allSettled([
      optsArgs.originalLanguage ? getDefinedLanguages(optsArgs.originalLanguage, optsArgs.allowedLanguages) : fetchLanguageList(apiKey),
      delay(1000)
    ]);

    if (optsArgs.createSelector) {
      await createLanguageSelect(apiKey, optsArgs);
    }


    // handle google translate
    if (isBrowser() && (document.querySelector('html.translated-ltr') || document.querySelector('html.translated-rtl'))) return;

    return await new Promise(async (resolve, reject) => {
      try {
        const timeout = getWeployOptions().timeout;
        await startTranslationCycle(document.body, apiKey, timeout, true).catch(reject);

        if (isBrowser() && !isDomListenerAdded) {
          // Select the target node
          const targetNode = document.body;

          // Create an observer instance with a callback to handle mutations
          const observer = new MutationObserver(function(mutationsList) {
            let nodes = [];

            // check if the selectors need to be recreated
            let elements = Array.from(document.querySelectorAll('.weploy-lang-selector-loading')).filter(el => !el.querySelector('.weploy-lang-selector-ready-icon'));

            for(let mutation of mutationsList) {
              if (mutation.type === 'childList') {
                // Handling added nodes
                for(let addedNode of mutation.addedNodes) {
                  nodes.push(addedNode)
                }
              }
            }

            if (elements.length && optsArgs.createSelector) {
              createLanguageSelect(apiKey, optsArgs).then(() => {
                startTranslationCycle(document.body, apiKey, 2000).catch(reject)
              });
            } else {
              startTranslationCycle(document.body, apiKey, 2000).catch(reject)
            }
          });

          // Set up observer configuration: what to observe
          const config = { childList: true, subtree: true };

          // Start observing the target node with configured settings
          observer.observe(targetNode, config);

          isDomListenerAdded = true;
        }

        resolve(undefined);
      } catch(err) {
        console.log("getTranslations error", err);
        if (window.shouldConsoleWeployError) console.error(err);
        resolve(undefined);
      }
    })
  } catch(err) {
    console.log("getTranslations error 2", err);
    if (window.shouldConsoleWeployError) console.error(err);
  }
}

//@deprecated
function switchLanguage(language) {
  localStorage.setItem("language", language);
  setWeployActiveLang(language);
  const updatedUrl = addOrReplaceLangParam(window.location.href, language);
  setTimeout(() => {
    window.location.href = updatedUrl;
    // location.reload();
  }, 1000);
}


//@deprecated
function handleChangeCustomSelect(target){
  // Get elements by class
  const classElements = Array.from(document.getElementsByClassName("weploy-select"));
  // Get elements by ID, assuming IDs are like "weploy-select-1", "weploy-select-2", etc.
  const idElementsStartsWithClassName = Array.from(document.querySelectorAll(`[id^="weploy-select"]`));
  const isWithLangLabel = Array.from(target.classList).includes("weploy-select-with-name")
  const idElements = isWithLangLabel ? idElementsStartsWithClassName : idElementsStartsWithClassName.filter(el => !el.id.includes("weploy-select-with-name")); 
  // Combine and deduplicate elements
  const weploySwitchers = Array.from(new Set([...classElements, ...idElements]));

  const newValue = target.value;
  // Update only the select elements within weploySwitchers
  weploySwitchers.forEach(sw => { 
    const selects = sw.querySelector('select.weploy-exclude');
    if (selects && selects !== target) {
      selects.value = newValue;
    }
  });
  switchLanguage(newValue);
}

if (isBrowser()) {
  if (!window.weployUtils) {
     window.weployUtils = {}
  }
  window.weployUtils.isBrowser = isBrowser;
  window.weployUtils.getTranslations = getTranslations;
  window.weployUtils.switchLanguage = switchLanguage;
  window.weployUtils.getSelectedLanguage = getSelectedLanguage;
  window.weployUtils.createLanguageSelect = createLanguageSelect;
  window.weployUtils.handleChangeCustomSelect = handleChangeCustomSelect;
  window.weployUtils.getLanguageFromLocalStorage = getLanguageFromLocalStorage;
  window.weployUtils.setOptions = setOptions
}

module.exports.isBrowser = isBrowser;
module.exports.getTranslations = getTranslations;
module.exports.switchLanguage = switchLanguage;
module.exports.getSelectedLanguage = getSelectedLanguage;
module.exports.createLanguageSelect = createLanguageSelect;
module.exports.getLanguageFromLocalStorage = getLanguageFromLocalStorage;
module.exports.setOptions = setOptions;
