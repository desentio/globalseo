const { getGlobalseoOptions, MERGE_PREFIX, setIsTranslationInitialized } = require("../configs");
const { renderSelectorState } = require("../selector/renderSelectorState");
const extractTextNodes = require("./extractTextNodes");
const filterValidTextNodes = require("./filterValidTextNodes");
const { isExcludedClassName, isExcludedId, isInsideExcludedElement } = require("./isExcluded");
const isUrl = require("./isUrl");
const translateNodes = require("./translateNodes");

function modifyHtmlStrings(window, rootElement, language, apiKey, shouldOptimizeSEO) {
  return new Promise((resolve, reject) => {
    const seoNodes = []; // document will represent the title tag, if node == document then the updateNode function will update the title
    const otherNodes = []; // like form placeholder or other attributes that need to be translated

    if (shouldOptimizeSEO) {
      const metaTags = Array.from(window.document.getElementsByTagName('meta'));
      const cleanMetaTags = metaTags.filter((meta) =>  {
        if (!(meta.content || "").trim()) return false;

        const validMetaTagNames = ["description", "og:title", "og:description", "twitter:title", "twitter:description"];
       
        function isValidMeta() {
          const metaName = meta.name.toLowerCase();
          const metaProperty = (meta.getAttribute('property') || "").toLowerCase();
          return validMetaTagNames.includes(metaName) || validMetaTagNames.includes(metaProperty);
        }

        if (!isValidMeta()) return false;

        const isTheContentAnUrl = isUrl(meta.content);
        if (isTheContentAnUrl) return false;
        return true;
      });

      const options = getGlobalseoOptions(window);

      const imgTags = options.translateAttributes ? Array.from(window.document.getElementsByTagName('img')) : [];
      // only include img tags that has alt or title attribute
      const cleanImgTags = imgTags.filter((img) =>
        ((img.alt || "").trim() || (img.title || "").trim()) &&
        !isInsideExcludedElement(window, img)
      );

      const anchorTags = options.translateAttributes ? Array.from(window.document.getElementsByTagName('a')) : [];
      // only include anchor tags that has title attribute
      const cleanAnchorTags = anchorTags.filter((anchor) => (anchor.title || "").trim() && !isInsideExcludedElement(window, anchor));

      seoNodes.push(
        window.document,
        ...cleanMetaTags,
        ...cleanImgTags,
        ...cleanAnchorTags,
      )
    }

    const options = getGlobalseoOptions(window);
    if (options.translateFormPlaceholder) {
      const inputTags = Array.from(window.document.getElementsByTagName('input'));
      // only include input that has placeholder attribute
      const cleanAnchorTags = inputTags.filter((node) => (node.placeholder || "").trim() && !isInsideExcludedElement(window, node));

      const textareaTags = Array.from(window.document.getElementsByTagName('textarea'));
      // only include textarea that has placeholder attribute
      const cleanTextareaTags = textareaTags.filter((node) => (node.placeholder || "").trim() && !isInsideExcludedElement(window, node));

      otherNodes.push(
        ...cleanAnchorTags,
        ...cleanTextareaTags,
      )
    }

    if (options.translateSelectOptions) {
      const optionTags = Array.from(window.document.getElementsByTagName('option'));
      // only include option that has value attribute and make sure the select tag is not excluded
      const cleanOptionTags = optionTags.filter((node) => (node.textContent || "").trim() && !isInsideExcludedElement(window, node));

      otherNodes.push(
        ...cleanOptionTags,
      )
    }

    // translate input type="submit" & input type="button"
    const inputTypeButtonTags = Array.from(window.document.querySelectorAll('input[type="button"]'));
    const inputTypeSubmitTags = Array.from(window.document.querySelectorAll('input[type="submit"]'));
    const cleanInputTypeButtonTags = inputTypeButtonTags.filter((node) => (node.value || "").trim() && !isInsideExcludedElement(window, node));
    const cleanInputTypeSubmitTags = inputTypeSubmitTags.filter((node) => (node.value || "").trim() && !isInsideExcludedElement(window, node));

    otherNodes.push(
      ...cleanInputTypeButtonTags,
      ...cleanInputTypeSubmitTags,
    )


    const textNodes = [];
    extractTextNodes(window, rootElement, textNodes);

    const validTextNodes = filterValidTextNodes(textNodes) || [];
    // console.log("validTextNodes", validTextNodes)

    // handle a case where nodes already translated but some new texts are not translated yet
    // for example on initial load in homepage: ['good morning'] -> ['guten morgen']
    // then the user go to new route "/about", new dom added: ['guten morgen', 'good afternoon'] (this happen especially in nextjs because the route changes happens in client side)
    // this will ensure only good afternoon is included
    // list all cache values
    if (!window.translationCache) {
      window.translationCache = {};
    }
    const allLangCacheInAllPages = Object.keys(window.translationCache).reduce((prevValue, pathname) => {
      const pageCache = window.translationCache[pathname]; // { en: {}, de: {}, id: {}}
      Object.keys(pageCache).forEach(lang => {
        if (!prevValue[lang]) {
          prevValue[lang] = {};
        }
        const filteredPageCache = Object.keys(pageCache[lang])
          .filter(key => !key.startsWith(MERGE_PREFIX))
          .reduce((obj, key) => {
            obj[key] = pageCache[lang][key];
            return obj;
          }, {});
        prevValue[lang] = {...prevValue[lang], ...filteredPageCache};
      });
      return prevValue;
    }, {});
    const values = Object.values(allLangCacheInAllPages).flatMap(Object.values).filter(Boolean);
    const textNodeThatNotInPrevPage = validTextNodes.reduce((prevTextNode, textNode) => {
      // textContent as default
      textNode.originalTextContent = textNode.textContent;

      // merge
      if (textNode.fullTextArray) {
        // console.log("textNodeThatNotInPrevPage FULLTEXTARRAY", textNode.fullTextArray)
        return [...prevTextNode, textNode]
      }
      
      const isInCache = values.includes(textNode.textContent);

      // if the text is not in the cache, then add it to the list
      if (!isInCache) {
        // console.log("textNodeThatNotInPrevPage isInCache", isInCache)
        return [...prevTextNode, textNode]
      }

      // if the text is already translated in the previous page, then find the original text
      if (window.langHistory?.length) {
          const existingCache = Object.values(allLangCacheInAllPages).reduce((prev, value) =>  [...prev, ...Object.entries(value)], [])
            .find(([, value]) => {
              return value == textNode.textContent
            })
          
          // original text found
          if (existingCache) {
            textNode.originalTextContent = existingCache[0];
            if (textNode.context) {
              textNode.context.replace(textNode.textContent, textNode.originalTextContent)
            }
          }
        // }
      }

      return [...prevTextNode, textNode];
    }, [])

    translateNodes(window, textNodeThatNotInPrevPage, language, apiKey, seoNodes, otherNodes).then(() => {
      setIsTranslationInitialized(window, true);
    }).catch(reject).finally(() => {
      window.globalseoTranslating = false;
      renderSelectorState(window);
      // console.log("GLOBALSEO: translateNodes");
      resolve(undefined);
    });
  });
}

module.exports = modifyHtmlStrings;
