const detectRobot = require("./detectRobot")

// check if code runs on server or client
const isBrowser = () => typeof window !== 'undefined'
const API_URL = process.env.NO_CACHE ? "http://localhost:8081" : "https://api.globalseo.ai";
const CDN_URL = "";
const KV_URL = "https://cdn.globalseo.ai";
const USE_MERGE = false;
const CONTEXT_LIMIT = 3;
const MAX_WORDS_LENGTH_FOR_CONTEXT = 3;
const OLD_EXCLUDE_CLASS = "weploy-exclude";
const DEFAULT_UNTRANSLATED_VALUE = "globalseo-untranslated";
const MERGE_PREFIX = "weploy-merge";
const BRAND  = process.env.BRAND || "globalseo";
const PREV_SCRIPT_VERSION = process.env.PREV_SCRIPT_VERSION || "0.0.0";
const SPECIAL_API_KEYS = ["cb20c25d-2d15-46ab-aac2-de5aa6b0aeda"]

/** Translation Options */
var globalseoOptions;

function getGlobalseoOptions(window) {
  if (!window.globalseoOptions) {
    setGlobalseoOptions(window, {})
  }

  const userAgent = window.navigator?.userAgent;
  const isRobot = userAgent ? detectRobot(userAgent) : false;

  if (isRobot) {
    setGlobalseoOptions(window, {
      useBrowserLanguage: false,
      isRobot: true
    })
    return window.globalseoOptions;
  }

  return window.globalseoOptions;
}

function setGlobalseoOptions(window, value = {}) {
    window.globalseoOptions = {
      ...(window.globalseoOptions || {}),
      ...value,
    };
}

function getGlobalseoActiveLang(window) {
  const options = getGlobalseoOptions(window);
  if (window.paramsLang && options.translationMode != 'subdomain' && options.translationMode != 'subdirectory') {
    return window.paramsLang;
  } 
  if (!window.globalseoActiveLang) {
    setGlobalseoActiveLang(window, null)
  }
  return window.globalseoActiveLang;
}

function setGlobalseoActiveLang(window, language) {
  const options = getGlobalseoOptions(window);

  if (options.translationMode == 'subdomain' && !window.isWorker) {
    window.globalseoActiveLang = window.activeSubdomain || options.originalLanguage
    return;
  }

  if (options.translationMode == 'subdirectory') {
    window.globalseoActiveLang = window.activeSubdirectory || options.originalLanguage
    return;
  }

  window.globalseoActiveLang = language
}

function getIsTranslationInitialized(window) {
  if (!window.isTranslationInitialized) {
    setIsTranslationInitialized(window, null)
  }
  return window.isTranslationInitialized;
}

function setIsTranslationInitialized(window, value) {
  window.isTranslationInitialized = value
}

function shouldTranslateInlineText(window) {
  const options = getGlobalseoOptions(window);
  const shouldtranslateSplittedText = options?.translateSplittedText || USE_MERGE;
  return shouldtranslateSplittedText;
}

function isUntranslatedValue(value) {
  return value.includes(DEFAULT_UNTRANSLATED_VALUE) || value.includes("weploy-untranslated");
}

module.exports = {
  isBrowser,
  getGlobalseoOptions,
  setGlobalseoOptions,
  getGlobalseoActiveLang,
  setGlobalseoActiveLang,
  getIsTranslationInitialized,
  setIsTranslationInitialized,
  shouldTranslateInlineText,
  isUntranslatedValue,
  API_URL,
  CDN_URL,
  KV_URL,
  USE_MERGE,
  CONTEXT_LIMIT,
  MAX_WORDS_LENGTH_FOR_CONTEXT,
  globalseoOptions,
  OLD_EXCLUDE_CLASS,
  DEFAULT_UNTRANSLATED_VALUE,
  MERGE_PREFIX,
  BRAND,
  PREV_SCRIPT_VERSION,
  SPECIAL_API_KEYS
}
