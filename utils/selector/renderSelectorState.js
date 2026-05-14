const { getGlobalseoActiveLang, getGlobalseoOptions, isBrowser } = require("../configs");
const { getValueDisplays } = require("./valueDisplay");

const selectorStateClasses = {
  globalseo: {
    ready: 'globalseo-lang-selector-ready',
    loading: 'globalseo-lang-selector-loading',
    error: 'globalseo-lang-selector-error',
  },
  weploy: {
    ready: 'weploy-lang-selector-ready',
    loading: 'weploy-lang-selector-loading',
    error: 'weploy-lang-selector-error',
  }
}

async function renderSelectorState(window, opts = { shouldUpdateActiveLang: true, shouldLog: false, delay: 200 }) {
  if (!getValueDisplays(window).length) return;

  const shouldUpdateActiveLang = opts.shouldUpdateActiveLang

  const promised = getValueDisplays(window).map(async (selector) => {
    const weployValue = selector.querySelector('.weploy-lang-selector-value');
    if (weployValue) {
      weployValue.classList.add('globalseo-lang-selector-value');
      weployValue.classList.remove('weploy-lang-selector-value');

      const weployLoadingIcon = selector.querySelector('.weploy-lang-selector-loading-icon');
      if (weployLoadingIcon) {
        weployLoadingIcon.classList.add('globalseo-lang-selector-loading-icon');
        weployLoadingIcon.classList.remove('weploy-lang-selector-loading-icon');
      }
    }

    const value = selector.querySelector('.globalseo-lang-selector-value');
    // const value = globalSeoValue || weployValue
    // const classKey = weployValue ? 'weploy' : 'globalseo';
    const classKey = 'globalseo';

    const loadingClass = selectorStateClasses[classKey].loading;
    const readyClass = selectorStateClasses[classKey].ready;
    const errorClass = selectorStateClasses[classKey].error;

    if (value && shouldUpdateActiveLang) {
      const activeLang = getGlobalseoActiveLang(window) || "";
      const options = getGlobalseoOptions(window);
      value.textContent = (options.customLanguageCode?.[activeLang] || activeLang).toUpperCase();
    }

    if (window.globalseoTranslating) {
      selector.classList.add(loadingClass);
      selector.classList.remove(readyClass, errorClass);
      return;
    }

    if (window.globalseoError) {
      // Skip writes when the state is already what we'd render. Setting
      // innerHTML or classList unconditionally would trigger MutationObserver
      // each time renderSelectorState fires — and modifyHtmlStrings calls it
      // in its finally on every cycle, so a sticky error would loop.
      if (!selector.classList.contains(errorClass)) selector.classList.add(errorClass);
      if (selector.classList.contains(readyClass) || selector.classList.contains(loadingClass)) {
        selector.classList.remove(readyClass, loadingClass);
      }
      const ul = selector.nextElementSibling;

      const errorText = `ERROR: ${window.globalseoError}`;
      const existingError = ul.querySelector('.globalseo-errormsg');
      if (existingError) {
        if (existingError.innerHTML !== errorText) {
          existingError.innerHTML = errorText;
        }
        return;
      }

      const errorListItem = window.document.createElement('li');
      errorListItem.innerHTML = `<span class="globalseo-errormsg">${errorText}</span>`
      ul.appendChild(errorListItem);
      return;
    }

    const delay = window.isWorker ? 0 : opts.delay;
    return await new Promise((resolve) => {
      setTimeout(() => {
        selector.classList.add(readyClass);
        selector.classList.remove(errorClass, loadingClass);
        resolve(undefined)
      }, delay)
    })    
  });

  await Promise.all(promised);
}

module.exports = {
  renderSelectorState,
}
