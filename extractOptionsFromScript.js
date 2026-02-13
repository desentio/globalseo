const { isBrowser, BRAND } = require("./utils/configs");
const detectRobot = require("./utils/detectRobot");
const getPrefixedPathname = require("./utils/translation-mode/getPrefixedPathname");
const getUnprefixedPathname = require("./utils/translation-mode/getUnprefixedPathname");

function replaceCustomLinks(window, customLinks = {}, domainFromServer) {
  // find all tags with href and src
  const tagsWithSrc = window.document.querySelectorAll("[src]");
  const tagsWithHref = window.document.querySelectorAll("[href]");

  // replace the links
  for (let tag of tagsWithSrc) {
    const src = tag.getAttribute("src");
    if (customLinks[src]) {
      tag.setAttribute("src", customLinks[src]);
    } else {
      const url = new URL(src, window.location.origin);
      const hostname = url.hostname;
      const hostnameWithoutWWW = hostname.replace("www.", "");
      if (domainFromServer == hostnameWithoutWWW) {
        tag.setAttribute("src", url.href);
      }
    }
  }
  
  for (let tag of tagsWithHref) {
    const href = tag.getAttribute("href");
    if (customLinks[href]) {
      tag.setAttribute("href", customLinks[href]);
    } else {
      const url = new URL(href, window.location.origin);
      const hostname = url.hostname;
      const hostnameWithoutWWW = hostname.replace("www.", "");
      if (domainFromServer == hostnameWithoutWWW) {
        tag.setAttribute("href", url.href);
      }
    }
  }
}

/**
 * Extracts options from a script.
 *
 * @param {any} window - The global window object.
 * @param {Object} optsArgs - Options for extraction.
 * @param {string|null} optsArgs.activeLanguage - The active language (optional).
 * @param {string|null} optsArgs.domainFromServer - The domain from the server (optional).
 * @param {"globalseo"|"weploy"} [optsArgs.brand] - The brand name.
 *   - "searchParams": Extract options from query parameters.
 *   - "subdomain": Extract options from subdomains.
 *   - "pathname": Extract options from the path.
 */
function extractOptionsFromScript(window, optsArgs = {
  activeLanguage: null,
  domainFromServer: null,
}) {
  if (isBrowser()) {
    if (!window.translationCache) {
      window.translationCache = {};
    }
    window.currentPathname = window.location.pathname
  }

  // REQUIRED ATTRIBUTES
  const DATA_API_KEY = `data-${optsArgs.brand || BRAND}-key`
  const DATA_ORIGINAL_LANG = "data-original-language";
  const DATA_ALLOWED_LANGUAGES = "data-allowed-languages";
  const apiKey = window.translationScriptTag.getAttribute(DATA_API_KEY);

  // COMMON OPTIONAL ATTRIBUTES
  const DATA_USE_BROWSER_LANG = "data-use-browser-language"; // default: true
  const DATA_EXCLUDE_CLASSES = "data-exclude-classes";
  const DATA_EXCLUDE_IDS = "data-exclude-ids";
  const DATA_EXCLUDE_PATHS = "data-exclude-paths";
  const DATA_REPLACE_LINKS = "data-replace-links"; // default: true
  const DATA_AUTO_CREATE_SELECTOR = "data-auto-create-selector"; // default: true
  const DATA_DELAY = "data-timeout"; // default: 0
  const DATA_DYNAMIC_TRANSLATION = "data-dynamic-translation"; // default: true
  const DATA_TRANSLATE_ATTR = "data-translate-attributes"; // default: false

  // SUBDOMAIN OPTIONAL ATTRIBUTES
  const DATA_TRANSLATION_MODE = "data-translation-mode"; // default: "searchParams"

  // ADVANCED OPTIONAL ATTRIBUTES
  const DATA_LANG_PARAMETER = "data-lang-parameter"; // default: "lang"
  const DATA_CUSTOM_LANG_CODE = "data-custom-language-code"; // format: "kk=kz, en=us, ru=rs"
  const DATA_MERGE_INLINE = "data-translate-splitted-text"; // default: false
  const DATA_EXCLUDE_CONTENTS = "data-exclude-contents"; // format: "{{content1}}, {{content2}}"
  const DATA_DEBOUNCE = "data-debounce" // format: "2000"
  const DATA_TRANSLATE_FORM_PLACEHOLDER = "data-translate-form-placeholder"
  const DATA_TRANSLATE_SELECT_OPTIONS = "data-translate-select-options"
  const DATA_DOMAIN_SOURCE_PREFIX = "data-domain-source-prefix"
  const DATA_CUSTOM_LINKS = "data-custom-links"

  // DOMAIN MODE ATTRIBUTES
  const DATA_ORIGINAL_DOMAIN = "data-original-domain";
  const DATA_TRANSLATED_DOMAINS = "data-translated-domains";

  const DATA_TRANSLATION_CACHE = "data-translation-cache";
  const DATA_SOURCE_ORIGIN = "data-source-origin";

  // WORKER ATTRIBUTES
  // const DATA_PREVENT_INIT_TRANSLATION = "data-prevent-init-translation" // default: false
  // const preventInitialTranslation = window.translationScriptTag.getAttribute(DATA_PREVENT_INIT_TRANSLATION) == "true";

  const DATA_ACTIVE_SUBDOMAIN = "data-active-subdomain"; // default: undefined
  const activeSubdomain = window.translationScriptTag.getAttribute(DATA_ACTIVE_SUBDOMAIN);

  const DATA_ACTIVE_SUBDIRECTORY = "data-active-subdirectory"; // default: undefined
  const activeSubdirectory = window.translationScriptTag.getAttribute(DATA_ACTIVE_SUBDIRECTORY);

  // prevent initial translation for subdomain (but allow translation on dynamic content)
  if (activeSubdomain) {
    window.preventInitialTranslation = true;
    window.activeSubdomain = activeSubdomain;
  }

  if (activeSubdirectory) {
    window.preventInitialTranslation = true;
    window.activeSubdirectory = activeSubdirectory;
  }

  // DOMAIN MODE: parse original hostname and translated domains
  const originalDomain = window.translationScriptTag.getAttribute(DATA_ORIGINAL_DOMAIN);
  const translatedDomainsAttr = window.translationScriptTag.getAttribute(DATA_TRANSLATED_DOMAINS);
  const translatedDomains = translatedDomainsAttr ? translatedDomainsAttr.split(",").map(d => d.trim()).filter(Boolean) : [];

  const activeServerSideLang = activeSubdomain || activeSubdirectory;

  const customLinksAttribute = window.translationScriptTag.getAttribute(`${DATA_CUSTOM_LINKS}-${activeServerSideLang}`);
  let customLinks = {};
  try {
    // format: [oldUrl,newUrl], [oldUrl,newUrl]
    const parsed = JSON.parse(`[${customLinksAttribute.replaceAll('\'', '"')}]`);
    customLinks = parsed.reduce((acc, [oldUrl, newUrl]) => {
      acc[oldUrl] = newUrl;
      return acc;
    }, {});
    
    replaceCustomLinks(window, customLinks, optsArgs.domainFromServer);
  } catch (e) {
    customLinks = {};
  }

  // FEATURE: Prevent Google Translate from translating the page
  // Set the 'translate' attribute of the HTML tag to 'no'
  window.document.documentElement.setAttribute('translate', 'no');

  // Create a new meta element
  const meta = window.document.createElement('meta');
  meta.name = 'google';
  meta.content = 'notranslate';

  // Append the meta element to the head of the document
  window.document.head.appendChild(meta);

  // FEATURE: Get text inside brackets
  const excludeContentsRegex = /{{((?:[^}]|\\})*)}}/g;
  function getTextInsideBrackets(str) {
    let match;
    let matches = [];

    while ((match = excludeContentsRegex.exec(str)) !== null) {
        // Replace escaped closing brackets with a single closing bracket
        let cleanedMatch = match[1].replace(/\\\\}/g, '}');
        cleanedMatch = cleanedMatch.replace(/\\\\{/g, '{');

        matches.push(cleanedMatch);
    }

    return matches;
  }

  const translationMode = window.translationScriptTag.getAttribute(DATA_TRANSLATION_MODE) || "searchParams";

  const langParam = window.translationScriptTag.getAttribute(DATA_LANG_PARAMETER) || "lang";

  // DOMAIN MODE: detect active language from current host (hostname:port)
  if (translationMode === "domain" && isBrowser() && originalDomain && translatedDomains.length) {
    const currentHost = window.location.host; // includes port if non-default
    if (currentHost !== originalDomain) {
      const rawAllowedLangs = (window.translationScriptTag.getAttribute(DATA_ALLOWED_LANGUAGES) || "")
        .split(",").map(l => l.trim().toLowerCase()).filter(Boolean);
      const rawOriginalLang = (window.translationScriptTag.getAttribute(DATA_ORIGINAL_LANG) || window.translationScriptTag.getAttribute("data-original-lanugage") || "").trim().toLowerCase();
      const filteredLangs = rawAllowedLangs.filter(l => l !== rawOriginalLang);
      const domainIndex = translatedDomains.indexOf(currentHost);
      if (domainIndex !== -1 && filteredLangs[domainIndex]) {
        window.activeDomainLang = filteredLangs[domainIndex];
      }
    }
  }

  const search = window.location.search;
  const params = new URLSearchParams(search);
  const paramsLang = window.activeSubdomain || window.activeSubdirectory || window.activeDomainLang || optsArgs.activeLanguage || params.get(langParam);
  window.paramsLang = paramsLang;

  const paramsUpdateTranslation = params.get('globalseo_update_translation');

  // defined languages so dont need extra fetch
  const originalLangAttr = window.translationScriptTag.getAttribute(DATA_ORIGINAL_LANG) || window.translationScriptTag.getAttribute("data-original-lanugage");
  const originalLang = (originalLangAttr || "").trim().toLowerCase();

  const allowedLangAttr = window.translationScriptTag.getAttribute(DATA_ALLOWED_LANGUAGES);
  const allowedLangs = (allowedLangAttr || "").trim().toLowerCase().split(",").filter(lang => lang && lang.trim() != originalLang).map(lang => lang.trim());

  // DOMAIN MODE: build language-to-domain mapping
  const langToDomainMap = {};
  if (translationMode === "domain" && originalDomain) {
    langToDomainMap[originalLang] = originalDomain;
    allowedLangs.forEach((lang, index) => {
      if (translatedDomains[index]) {
        langToDomainMap[lang] = translatedDomains[index];
      }
    });
  }

  // always use original language for subdomain
  let activeLang = (window.globalseoActiveLang || paramsLang || originalLang);

  if (translationMode == "subdomain" && !window.isWorker) {
    activeLang = window.globalseoActiveLang
  }

  if (translationMode == "subdirectory" && !window.isWorker) {
    activeLang = window.globalseoActiveLang
  }

  if (translationMode == "domain" && !window.isWorker) {
    activeLang = window.globalseoActiveLang || window.activeDomainLang || originalLang
  }
  
  if (activeLang && (window.document.documentElement.lang != activeLang)) {
    window.document.documentElement.lang = activeLang;
  }

  const domainSourcePrefixAttr = window.translationScriptTag.getAttribute(DATA_DOMAIN_SOURCE_PREFIX) || "";
  // cleaned up the slashes at the beginning and end (clean up mutiple slashes too)
  const domainSourcePrefix = domainSourcePrefixAttr.replace(/^\/+|\/+$/g, "");

  function handleLinkTags() {
    const domainWithoutWww = window.location.hostname.split('.').slice(1).join('.').replace("https://www.", "https://").replace("http://www.", "http://");
    let domain = window.location.hostname;

    if (activeSubdomain) {
      domain = domainWithoutWww
    }

    if (activeSubdirectory && optsArgs.domainFromServer) {
      domain = optsArgs.domainFromServer;
    }
    

    // FEATURE: Create a canonical link tag for translated pages
    // e.g. https://example.com/path?lang=es
    // Cleanup the original canonical link tag
    const existingCanonicalLinkTag = window.document.querySelector('link[rel="canonical"]');
    if (existingCanonicalLinkTag) {
      existingCanonicalLinkTag.remove();
    }

    const newCanonicalLinkTag = window.document.createElement('link');
    if (translationMode == "searchParams") {
      if (!paramsLang || paramsLang == originalLang) {
        newCanonicalLinkTag.href = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
      } else {
        newCanonicalLinkTag.href = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${langParam}=${paramsLang}`;
      }
    }

    if (translationMode == "subdomain") {
      if (!activeLang || (activeLang == originalLang)) {
        newCanonicalLinkTag.href = `${window.location.protocol}//${domain}${window.location.pathname}`;
      } else {
        // Create a new URL object
        let url = new URL(window.location.href);
        url.hostname = `${activeLang}.${domain}`;
        url.pathname = getUnprefixedPathname(window, domainSourcePrefix, url.pathname);
        newCanonicalLinkTag.href = url.href;
      }
    }

    if (translationMode == "subdirectory") {
      if (!activeLang || (activeLang == originalLang)) {
        newCanonicalLinkTag.href = `${window.location.protocol}//${domain}${window.location.pathname}`;
      } else {
        let url = new URL(window.location.href);
        url.hostname = domain;
        // url.pathname = url.pathname.replace(domainSourcePrefix, "");
        url.pathname = getUnprefixedPathname(window, domainSourcePrefix, url.pathname);

        newCanonicalLinkTag.href = url.href;
      }
    }

    if (translationMode == "domain") {
      newCanonicalLinkTag.href = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
    }

    newCanonicalLinkTag.setAttribute('rel', 'canonical');
    window.document.head.appendChild(newCanonicalLinkTag);

    // Add alternate link tag for original languages
    const alternateLinkTag = window.document.createElement('link');
    alternateLinkTag.setAttribute('rel', 'alternate');
    alternateLinkTag.setAttribute('hreflang', originalLang);

    const subdirUrl = new URL(window.location.href);
    // cleanup from prefix and language to get the real pathname
    subdirUrl.pathname = getUnprefixedPathname(window, domainSourcePrefix, subdirUrl.pathname);
    subdirUrl.pathname = subdirUrl.pathname.replace(`/${activeSubdirectory}/`, '/'); 
    const cleanPathname = subdirUrl.pathname;
    
    // const cleanPathname = `${window.location.pathname.replace(domainSourcePrefix, "").replace(`/${originalLang}/`, '/')}`; // cleanup from  language to get the real pathname
    const originalPathname = getPrefixedPathname(window, domainSourcePrefix, subdirUrl.pathname) // add back the prefix
    const subdirectoryHref = `${window.location.protocol}//${domain}${originalPathname}`
    // append prefix to the original lang because the subdomain will be accessed without the prefix (dont append if subdirectory mode)
    if (translationMode == "domain") {
      alternateLinkTag.href = `${window.location.protocol}//${originalDomain}${window.location.pathname}`;
    } else {
      alternateLinkTag.href = translationMode == "subdirectory" ? subdirectoryHref : `${window.location.protocol}//${domain}${getPrefixedPathname(window, domainSourcePrefix, window.location.pathname)}`;
    }
    window.document.head.appendChild(alternateLinkTag);

    // Add alternate link tags for allowed languages
    for (let lang of allowedLangs) {
      const alternateLinkTag = window.document.createElement('link');
      // Create a new URL object
      let url = new URL(window.location.href);
      // Set the search parameter "lang" to lang
      url.searchParams.set(langParam, lang);
      alternateLinkTag.setAttribute('rel', 'alternate');
      alternateLinkTag.setAttribute('hreflang', lang);
      if (translationMode == "searchParams") {
        alternateLinkTag.href = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${langParam}=${lang}`;
      }
      if (translationMode == "subdomain") {
        // Create a new URL object
        let url = new URL(window.location.href);
        url.hostname = activeSubdomain ? `${lang}.${domain}` : `${lang}.${domainWithoutWww}`;
        url.pathname = getUnprefixedPathname(window, domainSourcePrefix, url.pathname);
        alternateLinkTag.href = url.href;
      }
      if (translationMode == "subdirectory") {
        // remove lang param
        url.searchParams.delete(langParam);

        // append the first slash with lang
        // google.com -> google.com/en
        // url.pathname = url.pathname.replace(domainSourcePrefix, "")
        url.pathname = getUnprefixedPathname(window, domainSourcePrefix, url.pathname);
        url.pathname = url.pathname.replace(`/${activeSubdirectory}/`, '/'); // cleanup from prefix and language to get the real pathname
        let pathnames = url.pathname.split('/');
        if (lang && (lang != originalLang)) pathnames.splice(1, 0, lang);
        url.pathname = pathnames.join('/');
        if (lang == originalLang) url.pathname = `${domainSourcePrefix}${url.pathname}`
        alternateLinkTag.href = url.href;
      }
      if (translationMode == "domain") {
        const domainForLang = langToDomainMap[lang];
        if (domainForLang) {
          alternateLinkTag.href = `${window.location.protocol}//${domainForLang}${window.location.pathname}`;
        }
      }

      window.document.head.appendChild(alternateLinkTag);
    }
  }

  if ((!activeSubdomain && !activeSubdirectory )|| window.isWorker) {
    handleLinkTags();
  }

  // console.log(process.env.NO_CACHE)

  // // check if the page works without the trailing slash
  // checkPage();

  if (isBrowser()) {
    // subdomain may dont need to check expiration
    if (!window.isWorker && !window.activeSubdomain && !window.activeSubdirectory) {
      try {
        // get the current date
        const now = new Date();
    
        // get the current date timestamp
        const nowTimestamp = now.getTime();
    
        // get existing expiration timestamp
        const globalseoExpirationTimestamp = window.localStorage.getItem("globalseoExpirationTimestamp");
        const expiration = Number(globalseoExpirationTimestamp);
    
        if (!isNaN(expiration) && expiration < nowTimestamp) {
          window.localStorage.removeItem("globalseoExpirationTimestamp");
          window.localStorage.removeItem("translationCachePerPage");
        }
      } catch (e) {
        console.log("Error checking expiration", e)
      }
    }
  
    const userAgent = window.navigator.userAgent;
    const isRobot = detectRobot(userAgent);
    if (!isRobot) {
      const translationCache = window.localStorage.getItem("translationCachePerPage");
      try {
        const parsedTranslationCache = JSON.parse(translationCache);
        if (parsedTranslationCache && typeof parsedTranslationCache === "object") {
          window.translationCache = parsedTranslationCache;
        }

        const injectedCacheElement = document.getElementById("globalseo-translation-cache");
        if (injectedCacheElement) {
          try {
            const stringifiedCache = injectedCacheElement.textContent;
            const parsedCache = JSON.parse(stringifiedCache);

            window.translationCache = {
              ...window.translationCache,
              [window.location.pathname]: {
                ...window.translationCache[window.location.pathname],
                ...parsedCache[window.location.pathname]
              }
            }
          } catch(error) {
            // do nothing
          }
        }

        // handle cache coming from server side rendering
        const thisScriptTranslationCache = window.translationScriptTag.getAttribute(DATA_TRANSLATION_CACHE);
        if (thisScriptTranslationCache) {
          const parsedThisScriptTranslationCache = JSON.parse(thisScriptTranslationCache);
          window.translationCache = {
            ...window.translationCache,
            [window.location.pathname]: {
              ...window.translationCache[window.location.pathname],
              ...parsedThisScriptTranslationCache[window.location.pathname]
            }
          }
        }

        window.localStorage.setItem("translationCachePerPage", JSON.stringify(window.translationCache));
      } catch (e) {
        console.log("Error parsing translation cache", e)
      }
    } else {
      window.translationCache = {};
    }
  }

  const customLanguageCodeAttr = window.translationScriptTag.getAttribute(DATA_CUSTOM_LANG_CODE); // format is "kk=kz, en=us, ru=rs"
  const customLanguageCode = customLanguageCodeAttr ? customLanguageCodeAttr.split(",").reduce((acc, lang) => {
    const [key, value] = lang.trim().split("=");
    if (!key || !value) return acc;

    acc[key] = value;
    return acc;
  }, {}) : {};

  // this is backward compatibility for use browser language
  const disableAutoTranslateAttr = window.translationScriptTag.getAttribute("data-disable-auto-translate");
  const disableAutoTranslate = disableAutoTranslateAttr == "true";
  const useBrowserLanguageAttr = window.translationScriptTag.getAttribute(DATA_USE_BROWSER_LANG);
  const useBrowserLanguage = useBrowserLanguageAttr != "false" && useBrowserLanguageAttr != false;

  // exclude classes
  const excludeClassesAttr = (window.translationScriptTag.getAttribute(DATA_EXCLUDE_CLASSES) || "").trim()
  const excludeClassesByComma = excludeClassesAttr.split(",").filter(className => !!className).map(className => className.trim());
  const excludeClassesBySpace = excludeClassesAttr.split(" ").filter(className => !!className).map(className => className.trim().replaceAll(",", ""));
  const mergedExcludeClasses = [...excludeClassesByComma, ...excludeClassesBySpace];
  const excludeClasses = [...new Set(mergedExcludeClasses)]; // get unique values

  // exclude ids
  const excludeIdsAttr = (window.translationScriptTag.getAttribute(DATA_EXCLUDE_IDS) || "").trim()
  const excludeIdsByComma = excludeIdsAttr.split(",").filter(id => !!id).map(id => id.trim());
  const excludeIdsBySpace = excludeIdsAttr.split(" ").filter(id => !!id).map(id => id.trim().replaceAll(",", ""));
  const mergedExcludeIds = [...excludeIdsByComma, ...excludeIdsBySpace];
  const excludeIds = [...new Set(mergedExcludeIds)]; // get unique values

  // exclude paths
  const excludePathsAttr = (window.translationScriptTag.getAttribute(DATA_EXCLUDE_PATHS) || "").trim()
  const excludePathsByComma = excludePathsAttr.split(",").filter(path => !!path).map(path => path.trim());
  const excludePathsBySpace = excludePathsAttr.split(" ").filter(path => !!path).map(path => path.trim().replaceAll(",", ""));
  const mergedExcludePaths = [...excludePathsByComma, ...excludePathsBySpace];
  const excludePaths = [...new Set(mergedExcludePaths)]; // get unique values

  // exclude contents
  const excludeContentsAttr = (window.translationScriptTag.getAttribute(DATA_EXCLUDE_CONTENTS) || "").trim()
  const splittedContents = getTextInsideBrackets(excludeContentsAttr);
  const excludeContents = [...new Set(splittedContents)]; // get unique values

  // timeout
  const timeoutAttr = window.translationScriptTag.getAttribute(DATA_DELAY);
  const timeout = isNaN(Number(timeoutAttr)) ? 0 : Number(timeoutAttr);

  const createSelector = window.translationScriptTag.getAttribute(DATA_AUTO_CREATE_SELECTOR) != "false";

  const translateAttributes = window.translationScriptTag.getAttribute(DATA_TRANSLATE_ATTR) == "true";

  const dynamicTranslation = paramsUpdateTranslation == "true" || (window.translationScriptTag.getAttribute(DATA_DYNAMIC_TRANSLATION) != "false");

  const translateSplittedText = window.translationScriptTag.getAttribute(DATA_MERGE_INLINE) == "true";

  const shouldReplaceLinks = window.translationScriptTag.getAttribute(DATA_REPLACE_LINKS) != "false";

  const debounceDuration = window.translationScriptTag.getAttribute(DATA_DEBOUNCE);

  const translateFormPlaceholder = window.translationScriptTag.getAttribute(DATA_TRANSLATE_FORM_PLACEHOLDER) == "true";

  const translateSelectOptions = window.translationScriptTag.getAttribute(DATA_TRANSLATE_SELECT_OPTIONS) == "true";

  const sourceOrigin = window.translationScriptTag.getAttribute(DATA_SOURCE_ORIGIN);

  return {
    useBrowserLanguage: !disableAutoTranslate && useBrowserLanguage,
    createSelector: createSelector,
    excludeClasses,
    excludeIds,
    excludePaths,
    excludeContents,
    originalLanguage: originalLang,
    allowedLanguages: allowedLangs,
    timeout: timeout,
    customLanguageCode,
    translateAttributes,
    dynamicTranslation,
    translateSplittedText: false,
    langParam,
    debounceDuration,
    translateFormPlaceholder,
    translateSelectOptions,
    shouldReplaceLinks,
    paramsLang,
    apiKey,
    translationMode,
    domainSourcePrefix,
    customLinks,
    sourceOrigin,
    originalDomain,
    translatedDomains,
    langToDomainMap,
  }
}

module.exports = extractOptionsFromScript;
