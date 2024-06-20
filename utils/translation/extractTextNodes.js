const { getWeployOptions, shouldTranslateInlineText, CONTEXT_LIMIT, MAX_WORDS_LENGTH_FOR_CONTEXT } = require("../configs");
const isUrl = require("./isUrl");

function collectAllTextContentInsideNode(node, shouldExclude = false) {
  const weployOptions = getWeployOptions();

  const textNodes = [];
  node.childNodes.forEach((child) => {
    if (shouldExclude && child && child.className && typeof child.className == "string" && child.className.includes("weploy-exclude")) return;

    if (
      child &&
      child.className &&
      typeof child.className == "string" &&
      (child.className.includes("weploy-exclude") || weployOptions.excludeClasses.length && weployOptions.excludeClasses.some(excludeClass => excludeClass && node.className.includes(excludeClass)) )
    ) {
      return;
    }

    if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
      textNodes.push(child);
    } 
    
    if (child.nodeType !== Node.TEXT_NODE) {
      textNodes.push(...collectAllTextContentInsideNode(child));
    }
  });
  return textNodes;
}

function assignFullTextToTextNodes(node, textNodes, topLevelTagName) {
  const fullTextArray = textNodes.map((textNode) => textNode.textContent);
  const fullTextTagNames = textNodes.map((textNodes) => textNodes.parentNode.tagName)

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      // if (child.textContent.trim()) {
        child.fullTextArray = fullTextArray;
        child.fullTextIndex = textNodes.findIndex((textNode) => textNode === child);
        child.fullTextTagNames = fullTextTagNames;
        child.topLevelTagName = topLevelTagName;
        child.cacheKey = `weploy-merge-${JSON.stringify(fullTextArray.filter(x => x && x.trim()))}`; // get rid of empty string
      // }
    } else {
      assignFullTextToTextNodes(child, textNodes, topLevelTagName);
    }
  });
}

function extractTextNodes(node, textNodes) {
  if (!node) return;
  if (node.tagName && ["SCRIPT", "SVG", "PATH", "CIRCLE", "TEXTAREA", "INPUT", "STYLE", "NOSCRIPT"].includes(node.tagName.toUpperCase())) return;

  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentNode.tagName && ["SCRIPT", "SVG", "PATH", "CIRCLE", "TEXTAREA", "INPUT", "STYLE", "NOSCRIPT"].includes(node.parentNode.tagName.toUpperCase())) return;

    
    if(isUrl(node.textContent)) return;

    const options = getWeployOptions();
    if (options.excludeContents.length && options.excludeContents.find((x) => {
      const regex = new RegExp(x);
      return regex.test(node.textContent);
    })) return;

    // Check if the text node is empty
    if (!node.textContent.trim()) return;

    // fullTextArray assignment
    // 1. must be a text node (example: "im")
    // 2. must be a child of an inline element (example: <span>im</span>)
    // 3. minimum has 1 parent sibling (not including itself) (<div><span>im</span><span>portant</span></div>)
    // 4. all parent siblings are inline elements OR not inline BUT all of its children are inline
    // 5. all parent siblings are NOT links or buttons (it means they were navigations)
    if (
      shouldTranslateInlineText() &&
      !node.cacheKey && 
      // 2. must be a child of an inline element
      node.parentNode instanceof Element && window.getComputedStyle(node.parentNode).display === 'inline' &&
      // not a link or button or list item
      node.parentNode.tagName !== 'A' && node.parentNode.tagName !== 'BUTTON' && node.parentNode.tagName !== 'LI'
    ) {
      const parentSiblings = [];
      
      (node.parentNode.parentNode.childNodes || []).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.textContent.trim()) {
            parentSiblings.push(child);
          }
        } else {
          parentSiblings.push(child);
        }
      });

      const parentSiblingsValidity = parentSiblings.map((child) => {
        // if text node
        if (child.nodeType === Node.TEXT_NODE) {
          return true;
        }

        // // if not text node but contains a tag or button
        // if (child instanceof Element && (child.tagName === 'A' || child.tagName === 'BUTTON')) {
        //   return false;
        // }

        // if not text node and not a tag or button BUT has children that are a tags or buttons
        if (child instanceof Element) {
          const hasTagsOrButtons = Array.from(child.childNodes).some((grandChild) => {
            return grandChild instanceof Element && (grandChild.tagName === 'A' || grandChild.tagName === 'BUTTON');
          });

          return !hasTagsOrButtons;
        }

        // if not text node but inline
        if (child instanceof Element && window.getComputedStyle(child).display === 'inline') {
          return true;
        }

        // if not text node and not inline but all of its children are inline
        if (child instanceof Element && window.getComputedStyle(child).display !== 'inline') {
          const inlineChildren = [];
          const childrenTags = [];

          (child.childNodes || []).forEach((grandChild) => {
            if (grandChild instanceof Element && window.getComputedStyle(grandChild).display === 'inline') {
              inlineChildren.push(grandChild);
              if (grandChild.tagName === 'A' || grandChild.tagName === 'BUTTON' || grandChild.tagName === 'LI') {
                childrenTags.push(grandChild);
              }
            }

            if (grandChild.nodeType === Node.TEXT_NODE) {
              inlineChildren.push(grandChild);
            }
          });

          // if all children are a tag or button, return false
          if (childrenTags.length === child.childNodes.length) {
            return false;
          }

          return inlineChildren.length === child.childNodes.length;
        }

        return false;
      });

      const shouldAssignFullText = parentSiblingsValidity.every((validity) => validity);    
      
      // check if all parent siblings are links or buttons
      const isAllParentSiblingsAreLinksOrButtons = parentSiblings.every((child) => {
        return child instanceof Element && (child.tagName === 'A' || child.tagName === 'BUTTON' || child.tagName === "LI");
      });

      if (parentSiblings.length > 1 && shouldAssignFullText && !isAllParentSiblingsAreLinksOrButtons) {
        // console.log('node', node, parentSiblings);
        const textNodes = collectAllTextContentInsideNode(node.parentNode.parentNode);

        if (textNodes.length > 1) {
          const topLevelTagName = node.parentNode.parentNode.tagName; // inject top level tagname for extra context
          assignFullTextToTextNodes(node.parentNode.parentNode, textNodes, topLevelTagName);
        };
      }
    }

    // inject parentTagName for extra context
    const parentTagName = node.parentNode.tagName;
    node.parentTagName = parentTagName;

    function shouldAssignContext(theNode) {
      return !theNode.context && !theNode.fullTextArray;
    }

    if (shouldAssignContext(node)) {
      // inject html around the text node as context
      const textNodesForContext = collectAllTextContentInsideNode(node.parentNode.parentNode, true);
      // <div> Hello <div><div>Text 1 <span>fdfd</span></div></div> <h1>Text</h1></div>

      textNodesForContext.forEach((singleTextNode) => {
        // start the loop from current node, then do 2 loops, one through previous and the other one through next siblings, the previous check should add the textContent to the left and the next check should add textContent to the right of the current node textContent, if the total character already reach 100 or all siblings already checked, then stop
        const currentNodeIndex = textNodesForContext.findIndex((textNode) => textNode === singleTextNode);
        const leftTextNodes = [];
        const rightTextNodes = [];
        let totalWordsLeftSide = 0;
        let totalWordsRightSide = 0;
        let leftIndex = currentNodeIndex - 1;
        let rightIndex = currentNodeIndex + 1;

        // the limit of the total words for each side
        const contextLimit = CONTEXT_LIMIT;

        // Initialize a variable to keep track of the loop iteration
        let i = 0;

        // Continue the loop until the total character count reaches the limit or both indices are out of their respective bounds
        for (; (totalWordsLeftSide < contextLimit && leftIndex >= 0) || ( totalWordsRightSide < contextLimit && rightIndex < textNodesForContext.length); i++) {
          // Check if it's time to check the left side or if the right side is finished
          let shouldCheckLeft = totalWordsRightSide >= contextLimit || (i % 2 === 0 && leftIndex >= 0) || rightIndex >= textNodesForContext.length ;
          
          // Check if it's time to check the right side or if the left side is finished
          let shouldCheckRight = totalWordsLeftSide >= contextLimit || (i % 2 === 1 && rightIndex < textNodesForContext.length) || leftIndex < 0;

          if (shouldCheckLeft && totalWordsLeftSide < contextLimit) {
            // Get the text node from the left side
            const leftTextNode = textNodesForContext[leftIndex];
            
            // Add the text node to the left text nodes array
            leftTextNodes.unshift(leftTextNode);
            
            // Increase the total character count
            // console.log("totalWordsLeftSide", singleTextNode.textContent, totalWordsLeftSide, leftTextNode.textContent.trim().split(" ").length, leftTextNode.textContent)
            totalWordsLeftSide += leftTextNode.textContent.trim().split(" ").length;
            
            // Move the left index one step back
            leftIndex--;
          } else if (shouldCheckRight && totalWordsRightSide < contextLimit) {
            // Get the text node from the right side
            const rightTextNode = textNodesForContext[rightIndex];
            
            // Add the text node to the right text nodes array
            rightTextNodes.push(rightTextNode);
            
            // Increase the total character count
            // console.log("totalWordsRightSide", singleTextNode.textContent, totalWordsRightSide, rightTextNode.textContent.trim().split(" ").length, rightTextNode.textContent)
            totalWordsRightSide += rightTextNode.textContent.trim().split(" ").length;
            
            // Move the right index one step forward
            rightIndex++;
          }
        }

        const textNodesForContextWithCurrentNode = [...leftTextNodes, singleTextNode, ...rightTextNodes];

        const context = textNodesForContextWithCurrentNode.reduce((acc, textNode) => {
          // if has sibling, then dont inject tag name
          if (textNode.parentNode.childNodes.length > 1) {
            return `${acc} ${textNode.textContent}`;
          } else {
            return `${acc} <${textNode.parentNode.tagName.toLowerCase()}>${textNode.textContent}</${textNode.parentNode.tagName.toLowerCase()}>`;
          }
        }, '');


        // why not check this earlier?
        // because we need to run this function on the very top level of the node, if we block this earlier, then the lower level textNodes will not get the full context because this function only check for grandparent not further than that
        // <div>
        // "Very very very long text that doesnt need context "
        //    <span>
        //       "Short text"
        //    </span>
        // </div>
        const isMoreThanXWords = singleTextNode.textContent.trim().split(" ").length > MAX_WORDS_LENGTH_FOR_CONTEXT;

        if (!shouldAssignContext(singleTextNode) || isMoreThanXWords) {
          return;
        }
        const grandParentTagName = node.parentNode.parentNode.tagName.toLowerCase();
        singleTextNode.context = `<${grandParentTagName}>${context}</${grandParentTagName}>`;
      })
    }

    // if (!node.originalTextContent) {
    //   node.originalTextContent = node.textContent;
    // }

    textNodes.push(node);
  } else {
    const weployOptions = getWeployOptions();
    // filter out weploy-exclude
    if (
      node &&
      node.className &&
      typeof node.className == "string" &&
      (node.className.includes("weploy-exclude") || weployOptions.excludeClasses.length && weployOptions.excludeClasses.some(excludeClass => excludeClass && node.className.includes(excludeClass)) )
    ) {
      return;
    }
    for (let child of node.childNodes) {
      extractTextNodes(child, textNodes);
    }
  }
}

module.exports = extractTextNodes;