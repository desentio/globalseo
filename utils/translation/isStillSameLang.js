const { getGlobalseoOptions } = require("../configs");

function getActiveLang(window) {
  if (window.globalseoActiveLang) return window.globalseoActiveLang;

  const options = getGlobalseoOptions(window);

  if (options.translationMode == "subdomain") {
    const subdomain = window.location.hostname.split('.')[0];
    return subdomain;    
  }

  if (options.translationMode == "subdirectory") {
    const path = window.location.pathname.split('/');
    return path[1];
  }

  if (options.translationMode == "domain") {
    return window.activeDomainLang || options.originalLanguage;
  }

  const search = window.location.search;
  const params = new URLSearchParams(search);
  const activeLang = params.get(options.langParam || 'lang');
  if (!activeLang) return true;
}

function isStillSameLang(window, language) {
  const activeLang = getActiveLang(window);
  if (activeLang != language) {
    return false;
  } else {
    return true;
  }
}

module.exports = isStillSameLang;
