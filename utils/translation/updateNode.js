const { DEFAULT_UNTRANSLATED_VALUE, MERGE_PREFIX } = require("../configs");
const getCacheKey = require("./getCacheKey");

function decodeHTMLEntities(window, text = "") {
  let textArea = window.document.createElement('textarea');
  textArea.innerHTML = text;
  let decodedText = textArea.value;
  textArea = null; // Nullify the reference, so garbage collection can take care of it
  return decodedText;
}

function updateNode(window, node, language, type = "text", debugSource) {
  // console.log("update node", debugSource, node, node.textContent, language);

  // update title
  if (node == window.document) {
    const newText = window.translationCache?.[window.location.pathname]?.[language]?.[window.document.title] || "";  
    if (newText && !newText.includes(DEFAULT_UNTRANSLATED_VALUE) && !newText.includes("globalseo-untranslated")) {
      window.document.title = decodeHTMLEntities(window, newText);
    }
    return;
  }

  // update meta tags
  if (node.tagName == "META") {
    const newText = window.translationCache?.[window.location.pathname]?.[language]?.[node.content] || "";  
    if (newText && !newText.includes(DEFAULT_UNTRANSLATED_VALUE) && !newText.includes("globalseo-untranslated")) {
      node.content = decodeHTMLEntities(window, newText);
    }
    return;
  }

  // update image
  if (node.tagName == "IMG") {
    const newAlt = window.translationCache?.[window.location.pathname]?.[language]?.[node.alt] || "";
    const newTitle = window.translationCache?.[window.location.pathname]?.[language]?.[node.title] || "";

    if (newAlt && !newAlt.includes(DEFAULT_UNTRANSLATED_VALUE) && !newAlt.includes("globalseo-untranslated")) {
      node.alt = decodeHTMLEntities(window, newAlt);
    }

    if (newTitle && !newTitle.includes(DEFAULT_UNTRANSLATED_VALUE) && !newTitle.includes("globalseo-untranslated")) {
      node.title = decodeHTMLEntities(window, newTitle);
    }
    return;
  }

  // update anchor title
  if (type == "seo" && node.tagName == "A") {
    const newTitle = window.translationCache?.[window.location.pathname]?.[language]?.[node.title] || "";
    if (newTitle && !newTitle.includes(DEFAULT_UNTRANSLATED_VALUE) && !newTitle.includes("globalseo-untranslated")) {
      node.title = decodeHTMLEntities(window, newTitle);
    }
    return;
  }

  if (type == "form" && (node.tagName == "TEXTAREA" || (node.tagName == "INPUT" && node.type != "button" && node.type != "submit"))) {
    const newPlaceholder = window.translationCache?.[window.location.pathname]?.[language]?.[node.placeholder] || "";
    if (newPlaceholder && !newPlaceholder.includes(DEFAULT_UNTRANSLATED_VALUE) && !newPlaceholder.includes("globalseo-untranslated")) {
      node.placeholder = decodeHTMLEntities(window, newPlaceholder);
    }
    return;
  }

  if (type == "form" && (node.tagName == "INPUT" && (node.type == "button" || node.type == "submit"))) {
    const newValue = window.translationCache?.[window.location.pathname]?.[language]?.[node.value] || "";
    if (newValue && !newValue.includes(DEFAULT_UNTRANSLATED_VALUE) && !newValue.includes("globalseo-untranslated")) {
      node.value = decodeHTMLEntities(window, newValue);
    }
    return;
  }

  if (type == "form" && node.tagName == "OPTION") {
    const newText = window.translationCache?.[window.location.pathname]?.[language]?.[node.textContent] || "";
    if (newText && !newText.includes(DEFAULT_UNTRANSLATED_VALUE) && !newText.includes("globalseo-untranslated")) {
      node.textContent = decodeHTMLEntities(window, newText);
    }
    return;
  }

  const fullTextArray = node.fullTextArray;
  const text = node.textContent;
  const cache = getCacheKey(window, node);
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

  if (cache.includes(MERGE_PREFIX) && fullTextArray) {
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
        const mergedSplitted = splitted.reduce((acc, curr) => {
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
          const findTranslationKey = Object.entries(translatedMap).find(([, value], ) => {
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
        if (node.textContent == text && newValue != text) {
          // console.log("node.textContent replace", node.textContent, text, newValue)
          node.textContent = decodeHTMLEntities(window, newValue); // TODO: right now we only replace based on translation position, later we should swap the node position to preserve the styles
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
  if(newText && !newText.includes(DEFAULT_UNTRANSLATED_VALUE) && !newText.includes("globalseo-untranslated")) {
    // if (node.textContent == "Willkommen im Supermarkt" || text == "Willkommen im Supermarkt") {
    //   console.log("Willkommen im Supermarkt normal", node.textContent == text, node.textContent, text, newText)
    // }
    // console.log("isTextStillTheSame", node.textContent == text)
    // make sure text is still the same before replacing
    if(node.textContent == text && newText != text) {
      node.textContent = decodeHTMLEntities(window, newText);
    }
  }
}

module.exports = updateNode;
