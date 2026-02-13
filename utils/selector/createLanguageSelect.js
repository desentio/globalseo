if (process.env.IS_WEBPACK) {
  require(process.env.CSS_PATH || "../../globalseo.css")
}

const { loadingIconClassName, errorIconClassName, readyIconClassName, getLoadingGlobeIcon, getErrorGlobeIcon, getReadyGlobeIcon } = require("./icons");

const { isBrowser, getGlobalseoActiveLang, getGlobalseoOptions } = require("../configs");
const { getLanguageFromLocalStorage } = require("../languages/getSelectedLanguage");
const { fetchLanguageList } = require("../languages/fetchLanguageList");
const { renderSelectorState } = require("./renderSelectorState");
const { getValueDisplays, setValueDisplays } = require("./valueDisplay");
const getUnprefixedPathname = require("../translation-mode/getUnprefixedPathname");
const getPrefixedPathname = require("../translation-mode/getPrefixedPathname");


function addOrReplaceLangParam(window, url, lang) {
  let urlObj = new URL(url);

  const options = getGlobalseoOptions(window);

  if (options.translationMode == "subdomain") {
    let hostname = urlObj.hostname;
    let subdomain = lang;

    // get the domain without the subdomain
    let rawDomain = (window.isWorker || window.activeSubdomain) ? hostname.split('.').slice(1).join('.') : hostname;
    const isContainsWWW = rawDomain.startsWith('www.');
    const domain = isContainsWWW ? rawDomain.substring(4) : rawDomain;
    let newHostname = options.originalLanguage == lang ? domain : `${subdomain}.${domain}`;
    urlObj.hostname = newHostname;
    const newUrl = urlObj.toString();
    return newUrl;
  }

  if (options.translationMode == "subdirectory") {
    let pathnames = urlObj.pathname.split('/');
    if (lang && lang != options.originalLanguage) pathnames.splice(1, 0, lang);
    urlObj.pathname = pathnames.join('/');
    if ((!lang || lang == options.originalLanguage) && options.domainSourcePrefix) {
      urlObj.pathname = `${options.domainSourcePrefix}${urlObj.pathname}`;
    }
    return urlObj.toString();
  }

  if (options.translationMode == "domain") {
    const domain = options.langToDomainMap?.[lang];
    if (domain) {
      // domain may include port (e.g. "localhost:3001"), use host to set both
      const parts = domain.split(":");
      urlObj.hostname = parts[0];
      urlObj.port = parts[1] || "";
    }
    return urlObj.toString();
  }

  let params = new URLSearchParams(urlObj.search);
  
  params.set(options.langParam || 'lang', lang);
  urlObj.search = params.toString();

  return urlObj.toString();
}

async function autoPosition(window, ul, globalseoSwitcher) {
  // if (e.target != globalseoSwitcher) return;
  if(!ul) return;
  // const ul = e.target.querySelector("ul");
  const dropdownRect = ul.getBoundingClientRect();
  const switcherRect = globalseoSwitcher.getBoundingClientRect(); //Use position of the globalseoSwitcherButton not the dropdown
  // Check if the element is outside the viewport on the right side
  if ((switcherRect.x + dropdownRect.width) >= window.innerWidth) {
    ul.style.right = '0px';
    ul.style.left = 'auto';
  } else {
    ul.style.right = 'auto';
    ul.style.left = '0px';
  }

  // Check if the element is outside the viewport on the bottom side
  if ((switcherRect.y + dropdownRect.height) >= window.innerHeight) {
    ul.style.bottom = '0px';
  } else {
    ul.style.bottom = 'auto';
  }
}

function hideDropDown(element, globalseoSwitcher) {
  element.style.visibility = 'hidden';
  element.style.zIndex = '-1';
  element.style.pointerEvents = 'none';

  if (globalseoSwitcher) {
    globalseoSwitcher.style.overflow = 'hidden';
  }
}

async function createLanguageSelect(window, optsArgs = {}) {
  // if (!isBrowser()) return;
  const options = getGlobalseoOptions(window);
  const apiKey = options.apiKey;
  if (!apiKey) {
    console.error("Globalseo API key is required");
    return;
  }  

  function injectInlineStyle(css) {
    const style = window.document.createElement('style');
    style.id = `globalseo-style`;
    style.textContent = css;

    if (window.isWorker) {
      const head = window.document.head || window.document.getElementsByTagName("head")[0];
      if (head) head.appendChild(style);
    } else {
      let docBody = window.document.body || window.document.getElementsByTagName("body")[0];
      if (docBody) docBody.appendChild(style);
    }
  }

  // Check if the style tag already exists
  if (!window.document.getElementById(`globalseo-style`) && process.env.IS_WEBPACK) {
    const cssModule = require(process.env.CSS_PATH_RAW || "../../globalseo.css?raw");
    const css = cssModule.default || cssModule;
    injectInlineStyle(css)
  }

  if (!window.document.getElementById(`globalseo-style`) && !process.env.IS_WEBPACK) {
    const fs = require('fs')
    const path = require('path');
    const cssPath = path.join(__dirname, process.env.CSS_PATH || '../../globalseo.css');
    const css = fs.readFileSync(cssPath, 'utf8').toString()
    injectInlineStyle(css)
  }

  const availableLangs = optsArgs.isInit ? [] : await fetchLanguageList(window, apiKey);
  const langInLocalStorage = optsArgs.isInit ? "" : await getLanguageFromLocalStorage(window);
  const selectedLang = getGlobalseoActiveLang(window) || langInLocalStorage || availableLangs?.[0]?.lang || optsArgs.originalLanguage || "";
  const selectedLangUppercased = (selectedLang || "").substring(0, 2).toUpperCase();
  const selectedLangLowercased = (selectedLang || "").substring(0, 2).toLowerCase();

  ['weploy-select', 'weploy-select-with-name', 'globalseo-select'].forEach(className => {
    const brandName = className.startsWith("weploy") ? "weploy" : "globalseo";
    const isWithLangLabel = className == `${brandName}-select-with-name`;
    // Get elements by class
    const classElements = window.document.getElementsByClassName(className);
    // Get elements by ID, assuming IDs are like "globalseo-select-1", "globalseo-select-2", etc.
    const idElementsStartsWithClassName = Array.from(window.document.querySelectorAll(`[id^="${brandName}-select"]`));
    const idElements = isWithLangLabel ? idElementsStartsWithClassName : idElementsStartsWithClassName.filter(el => !el.id.includes(`${brandName}-select-with-name`)); 
    // Combine and deduplicate elements
    const globalseoSwitchers = Array.from(new Set([...classElements, ...idElements]));

    // replace weploy with globalseo
    if (brandName == 'weploy' && globalseoSwitchers.length > 0) {
      globalseoSwitchers.forEach((el) => {
        el.classList.add('globalseo-select');
        el.classList.remove('weploy-select');
        el.classList.remove('weploy-select-with-name');

        el.classList.add('globalseo-lang-selector-wrapper');
        el.classList.remove('weploy-lang-selector-wrapper')

        el.classList.add('globalseo-exclude');
        el.classList.remove('weploy-exclude');


        ['loading', 'ready', 'error'].forEach((state) => {
          const stateWrapper = el.querySelector(`.weploy-lang-selector-${state}`);
          if (stateWrapper) {
            stateWrapper.classList.add(`globalseo-lang-selector-${state}`);
            stateWrapper.classList.remove(`weploy-lang-selector-${state}`);
          }

          const icon = el.querySelector(`.weploy-lang-selector-${state}-icon`);
          if (icon) {
            icon.classList.add(`globalseo-lang-selector-${state}-icon`);
            icon.classList.remove(`weploy-lang-selector-${state}-icon`);
          }
        })

      });
      return;
    }

    if (globalseoSwitchers.length > 0 && availableLangs) {
      globalseoSwitchers.forEach((globalseoSwitcher) => {
        function injectDocumentClick(details) {
          window.document.addEventListener('click', function(event) {
            let isClickInside = globalseoSwitcher.contains(event.target);
          
            if (details && !isClickInside) {
              // Check if 'open' attribute is present before trying to remove it
              // if (details.hasAttribute('open')) {
              //   // To close:
              //   details.removeAttribute('open');
              // }
              const childUl = details.querySelector('ul');
              if (childUl) {
                hideDropDown(childUl, globalseoSwitcher);
              }
            }
          });
        }

        function injectOnClickToDetails(details) {
          details.onclick = (e) => { 
            e.preventDefault();
            const childUl = details.querySelector('ul');
            if (childUl) {
              if (childUl.style.visibility == 'hidden'){
                globalseoSwitcher.style.overflow = 'unset';
                childUl.removeAttribute('style');
                autoPosition(window, childUl, globalseoSwitcher);
              } else {
                hideDropDown(childUl, globalseoSwitcher);
              }
            }
          }
        }

        function injectOnClickToSummary(summary) {
          summary.onclick = (e) => { e.preventDefault(); }
        }

        function injectOnClickToAnchor(a, isSelected, details) {
          a.onclick = (event) => {
            event.stopPropagation();
            if (isSelected) return;
            // Check if 'open' attribute is present before trying to remove it
            if (details.hasAttribute('open')) {
              // To close:
              details.removeAttribute('open');
            }

            window.globalseoTranslating = true;
            renderSelectorState(window);
          };
        }


        // Check if already generated by worker using data-worker=true attribute
        let selectorGeneratedByWorker = globalseoSwitcher.querySelector(`.${brandName}-lang-selector-element[data-worker=true]`);
        if (selectorGeneratedByWorker) {
          // Inject events to the elements
          injectDocumentClick(selectorGeneratedByWorker);
          injectOnClickToDetails(selectorGeneratedByWorker);
          injectOnClickToSummary(selectorGeneratedByWorker.querySelector('summary'));

          // Inject events to the anchors
          let anchors = selectorGeneratedByWorker.querySelectorAll('a');
          anchors.forEach((a) => {
            injectOnClickToAnchor(a, a.classList.contains('selected'), selectorGeneratedByWorker);
          });
          return;
        }

        // Create the select element if not already present
        let selectorCreated = globalseoSwitcher.querySelector(`.${brandName}-lang-selector-element`);
        if (!selectorCreated) {
          const initializedSelectorByUser = globalseoSwitcher.querySelector('details');

          let languages = availableLangs

          globalseoSwitcher.classList.add(`${brandName}-lang-selector-wrapper`)
          globalseoSwitcher.classList.add(`${brandName}-exclude`)
          
          let details = initializedSelectorByUser || window.document.createElement('details');
          // details.dataset.behavior = 'languageSelector-topbar';
          details.role = 'group';
          // worker should not add this so the addEventListener will work in browser
          details.className = `${brandName}-lang-selector-element`
          if (window.isWorker) {
            details.setAttribute("data-worker", "true");
          }
          details.open = true;

          injectDocumentClick(details);
          injectOnClickToDetails(details);
          
          const initializedSummaryByUser = initializedSelectorByUser?.querySelector?.('summary')
          let summary = initializedSummaryByUser || window.document.createElement('summary');
          if (!initializedSummaryByUser) {
            // summary.setAttribute('aria-expanded', 'true');
            // summary.setAttribute('aria-haspopup', 'true');
            summary.role = 'button';      
            details.appendChild(summary); 
          }
          injectOnClickToSummary(summary);

          // console.log("initializedSummaryByUser", initializedSummaryByUser?.childNodes)
          const initializedLoadingIcon = initializedSummaryByUser?.querySelector?.(`.${loadingIconClassName}`);
          const initializedErrorIcon = initializedSummaryByUser?.querySelector?.(`.${errorIconClassName}`);
          const initializedReadyIcon = initializedSummaryByUser?.querySelector?.(`.${readyIconClassName}`);
          
          // Check for "data-icon-color" attribute and use it for font color
          const iconColor = 
            initializedLoadingIcon?.querySelector?.('path')?.getAttribute('stroke') || 
            initializedErrorIcon?.querySelector?.('path')?.getAttribute('stroke') || 
            initializedReadyIcon?.querySelector?.('path')?.getAttribute('stroke') || 
            globalseoSwitcher.getAttribute('data-icon-color') || 
            "#241c15";
          
          const loadingIcon = initializedLoadingIcon || getLoadingGlobeIcon(window, iconColor)
          const errorIcon = initializedErrorIcon || getErrorGlobeIcon(window, iconColor)
          const readyIcon = initializedReadyIcon || getReadyGlobeIcon(window, iconColor)
          
          getValueDisplays(window).push(summary);
          if (!initializedLoadingIcon) summary.insertBefore(loadingIcon, summary.firstChild)
          
          loadingIcon.after(errorIcon, readyIcon)

          const initializedSpanInSummaryByUser = initializedSummaryByUser?.querySelector?.(`.${brandName}-lang-selector-value`)
          let spanInSummary = initializedSpanInSummaryByUser || window.document.createElement('span');
          if (!initializedSpanInSummaryByUser) {
            spanInSummary.setAttribute('aria-hidden', 'true');
            // spanInSummary.textContent = selectedLangUppercased;
            spanInSummary.classList.add(`${brandName}-lang-selector-value`);
            if (iconColor) {
              spanInSummary.style.color = iconColor;
            }
            summary.appendChild(spanInSummary);
          } else {
            // spanInSummary.textContent = selectedLangUppercased;
            if (iconColor && !spanInSummary.style.color) {
              spanInSummary.style.color = iconColor;
            }
          }
          
          // Create a dropdown icon
          const initializedDropdownIconByUser = initializedSummaryByUser?.querySelector?.(`.${brandName}-lang-selector-dropdown`)
          const dropdownIcon = initializedDropdownIconByUser || window.document.createElement("div");
          if (!initializedDropdownIconByUser) {
            dropdownIcon.style.width = ".25rem";
            dropdownIcon.style.height = ".25rem";
            dropdownIcon.style.backgroundColor = iconColor;
            dropdownIcon.style.webkitClipPath = "polygon(50% 75%,100% 25%,0 25%)";
            dropdownIcon.style.clipPath = "polygon(50% 75%,100% 25%,0 25%)";
            dropdownIcon.classList.add(`${brandName}-lang-selector-dropdown`);
            summary.appendChild(dropdownIcon);
          } else {
            if (!dropdownIcon.style.backgroundColor) {
              dropdownIcon.style.backgroundColor = iconColor;
            }
          }
          
          let ul = window.document.createElement('ul');
          ul.className = `${brandName}-lang-selector-menu-container`;
          details.appendChild(ul);
          hideDropDown(ul, globalseoSwitcher);
          

          // globalseoSwitcher.onclick = autoPosition

          if (languages.length < 2) {
            let li = window.document.createElement('li');
            ul.appendChild(li);
            globalseoSwitcher.appendChild(details);

            li.style.cursor = 'auto';

            if (window.globalseoError) {
              let errorTextDiv = window.document.createElement('div');
              li.appendChild(errorTextDiv);

              errorTextDiv.style.padding = '5px';
              errorTextDiv.textContent = window.globalseoError;
            }
            
          }
          
          languages.forEach((language, index) => {
              const options = getGlobalseoOptions(window);

              const isSelected = language.lang == selectedLangLowercased;

              let li = window.document.createElement('li');
              ul.appendChild(li);

              let a = window.document.createElement('a');

              const prefix = options.domainSourcePrefix;

              const newUrl = new URL(window.location.href);

              if (prefix && options.translationMode == "subdomain") {
                if (options.originalLanguage == language.lang) {
                  newUrl.pathname = getPrefixedPathname(window, prefix, newUrl.pathname);
                } else {
                  newUrl.pathname = getUnprefixedPathname(window, prefix, newUrl.pathname);
                }
              }

              if (options.translationMode == "subdirectory") {
                if (newUrl.pathname.startsWith(`/${selectedLangLowercased}`)) {
                  newUrl.pathname = newUrl.pathname.replace(`/${selectedLangLowercased}`, "");
                }
              }

              const url = isSelected ? "#" : addOrReplaceLangParam(window, newUrl.href, language.lang);

              a.href = url;
              a.hreflang = language.lang;
              a.dataset.locale = language.lang;
              a.dataset.index = index;

              injectOnClickToAnchor(a, isSelected, details);

              a.className = `${brandName}-lang-selector-menu-container-item ${isSelected ? 'selected' : ''}`;

              li.appendChild(a);
          
              const langCode = options.customLanguageCode?.[language.lang] || language.lang;
              let span = window.document.createElement('span');
              span.setAttribute('aria-hidden', 'true');
              span.className = `${brandName}-lang-selector-menu-container-item-code`;
              span.textContent = langCode.toUpperCase();
              a.appendChild(span);
          
              let p = window.document.createElement('div');
              p.lang = language.lang;
              p.className = `${brandName}-lang-selector-menu-container-item-locale`;
              p.textContent = language.label;
              a.appendChild(p);

              if (isSelected) {
                let svg = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('aria-hidden', 'true');
                svg.setAttribute('viewBox', '0 0 24 24');
                svg.setAttribute('class', `${brandName}-lang-selector-menu-container-item-selected`);
                a.appendChild(svg);
        
                let path = window.document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('fill-rule', 'evenodd');
                path.setAttribute('clip-rule', 'evenodd');
                path.setAttribute('d', 'M20.7071 7.70712L9.99995 18.4142L4.79285 13.2071L6.20706 11.7929L9.99995 15.5858L19.2928 6.29291L20.7071 7.70712Z');
                svg.appendChild(path);
              }
          });
          
          if (!initializedSelectorByUser) globalseoSwitcher.appendChild(details);
          autoPosition(window, ul, globalseoSwitcher);
        }
      });
    }
  })
}


module.exports = {
  createLanguageSelect,
  addOrReplaceLangParam,
}
