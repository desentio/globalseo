const { getGlobalseoOptions, setGlobalseoActiveLang, getIsTranslationInitialized, isBrowser } = require("../configs");
const { fetchLanguageList } = require("./fetchLanguageList");

async function getLanguageFromLocalStorage(window) {
  if (!isBrowser()) return "";
  const options = getGlobalseoOptions(window)
  const apiKey = options.apiKey
  const paramsLang = window.paramsLang;
  const localStorageLang = localStorage.getItem("language");

  if (paramsLang && (paramsLang != localStorageLang)) {
    if (!getIsTranslationInitialized(window)) localStorage.setItem("language", window.activeSubdomain || paramsLang);
    setGlobalseoActiveLang(window, paramsLang);
    return paramsLang;
  }

  const availableLangs = options.definedLanguages || await fetchLanguageList(window, apiKey);
  let language = paramsLang || localStorageLang;

  if (!availableLangs.find(l => l.lang == language)) {
    saveDefaultLanguageToLocalStorage(window, availableLangs, (options.translationMode == "subdomain" || options.translationMode == "domain") ? false : options.useBrowserLanguage);
  } else {
    setGlobalseoActiveLang(window, language);
  }

  return language; // Get the language from local storage
}

// this only for the first time when the user visits the site and the language is not set
function saveDefaultLanguageToLocalStorage(window, availableLangs = [], useBrowserLang = true) {
  const language = window.navigator.language; // Get browser language (usually in this format: en-US)
  const langIsoCode = language && language.length >= 2 ? language.substring(0, 2) : null // Get the language ISO code
  const langInAvailableLangs = availableLangs.find(lang => lang.lang == langIsoCode) //  Check if the language is in the available languages

  // if no available languages, return
  if (!availableLangs.length) {
    return;
  }

  const langInAvailableLangsOrFirst = langInAvailableLangs?.lang || availableLangs[0].lang // If the language is not in the available languages, use the first available language
  const langToSave = useBrowserLang ? langInAvailableLangsOrFirst : availableLangs[0].lang // If useBrowserLang is true, use the language from the browser, otherwise use the first available language
  // Save the language to local storage
  if (!getIsTranslationInitialized(window)) localStorage.setItem("language", window.activeSubdomain || langToSave);
  setGlobalseoActiveLang(window, langToSave);
}

module.exports = {
  getLanguageFromLocalStorage,
  saveDefaultLanguageToLocalStorage
}
