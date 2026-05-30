const getUnprefixedPathname = require("./utils/translation-mode/getUnprefixedPathname");

function replaceLinks(window, {langParam, lang, translationMode, prefix, sourceOriginHostname, sourceOrigin, originalDomain, langToDomainMap}) {
  // Select all anchor tags
  const anchors = window.document.querySelectorAll('a:not(.globalseo-ignore-link)');

  // domain
  const sliced = window.location.hostname.split('.').slice(1).join('.');
  const domain = sliced.includes('.') ? sliced : window.location.hostname;
  const isInOriginalDomain = (domain == window.location.hostname) || window.location.hostname.startsWith(`www`);

  // DOMAIN MODE: pull the target translated domain out of langToDomainMap
  // so cross-lang internal links land on the right host.
  const targetDomainForLang = (translationMode === "domain" && langToDomainMap && lang) ? langToDomainMap[lang] : null;
  const originalDomainHost = (originalDomain || "").replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  // Loop through all anchor tags
  for (let i = 0; i < anchors.length; i++) {
    let anchor = anchors[i];

    if (!anchor.href) continue;
    const anchorUrlObj = new URL(anchor.href);
    if (prefix) {
      anchorUrlObj.pathname = getUnprefixedPathname(window, prefix, anchorUrlObj.pathname);
    }
    const isHashTagInSamePathname = (anchorUrlObj.pathname == window.location.pathname) && anchorUrlObj.href.includes("#");
    
    // anchor.getAttribute("href")?.startsWith?.("#") || (anchor.href == `${window.location.href}#`)
    if (isHashTagInSamePathname) {
      // Check if the link is a hash tag
      continue;
    }

    // skip relative links - leave them untouched (except for subdirectory mode which needs to prepend lang)
    if (translationMode !== 'subdirectory' && !anchor.href.startsWith("http") && !anchor.href.startsWith("tel:") && !anchor.href.startsWith("mailto:")) {
      continue;
    }

    // check for en.domain.com OR www.domain.com OR domain.com
    const isInternal = (anchor.hostname == `${lang}.${domain}`) || (anchor.hostname == `www.${domain}`) || anchor.hostname == window.location.hostname;

    const isInternalForSubdirectory = translationMode == "subdirectory" && (anchor.hostname == sourceOriginHostname || anchor.hostname == `www.${sourceOriginHostname}`);

    // domain mode: links to original domain (or any translated domain) are internal
    const isInternalForDomain = translationMode == "domain" && originalDomainHost && (
      anchor.hostname === originalDomainHost ||
      anchor.hostname === `www.${originalDomainHost}` ||
      anchor.hostname === window.location.hostname ||
      (langToDomainMap && Object.values(langToDomainMap).some(d => {
        const host = (d || "").split(":")[0];
        return host && (anchor.hostname === host || anchor.hostname === `www.${host}`);
      }))
    );

    if (!isInternal && !isInternalForSubdirectory && !isInternalForDomain) {
      // Check if the link is external
      continue;
    }

    if (translationMode == 'subdomain') {
      if (!lang) continue;
      // Create a new URL object
      let url = new URL(anchor.href);

      // append the first subdomain with lang
      // google.com -> en.google.com
      url.hostname = `${lang}.${domain}`;

      if (prefix) {
        url.pathname = getUnprefixedPathname(window, prefix, url.pathname);
      }

      // Update the href of the anchor tag
      anchor.href = url.href;
    } else if (translationMode == 'subdirectory') {
      // Create a new URL object
      let url = new URL(anchor.href);

      if (prefix) {
        url.pathname = getUnprefixedPathname(window, prefix, url.pathname);
      }

      url.hostname = window.location.hostname;

      // append the first slash with lang
      // google.com -> google.com/en
      let pathnames = url.pathname.split('/');
      if (lang) pathnames.splice(1, 0, lang); // lang can be undefined for path without prefix
      url.pathname = pathnames.join('/');
      if (!lang) url.pathname = `${prefix}${url.pathname}`

      // Update the href of the anchor tag
      anchor.href = url.href;
    } else if (translationMode == 'domain') {
      // swap host so internal navigation stays on the right per-lang domain
      if (!targetDomainForLang) continue;
      try {
        const url = new URL(anchor.href);
        const [host, port] = targetDomainForLang.split(":");
        url.hostname = host;
        url.port = port || "";
        anchor.href = url.href;
      } catch (err) {
        // do nothing
      }
    } else if (anchor.pathname != window.location.pathname) {
      // Check if the link is internal and does not contain a hash

      // Create a new URL object
      let url = new URL(anchor.href);

      // Set the search parameter "lang" to lang
      url.searchParams.set(langParam, lang);

      // Update the href of the anchor tag
      anchor.href = url.href;
    }
  }

  // For subdomain mode: replace href and src on ALL elements pointing to the original domain
  if (translationMode == 'subdomain' && domain && !isInOriginalDomain) {
    const currentHostname = window.location.hostname;
    const allElements = window.document.querySelectorAll('[href], [src]');

    for (let element of allElements) {
      // Skip elements inside the language selector
      if (element.closest('.globalseo-lang-selector-wrapper')) continue;
      // Skip link rel="alternate" and link rel="canonical"
      const rel = element.getAttribute('rel');
      if (rel === 'alternate' || rel === 'canonical') continue;
      const attrs = ['href', 'src'];
      for (let attr of attrs) {
        const value = element.getAttribute(attr);
        if (!value) continue;

        // Skip relative links - only process absolute URLs with hardcoded source domain
        if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('//')) continue;

        try {
          const url = new URL(value);
          const hostnameWithoutWww = url.hostname.replace(/^www\./, '');

          if (hostnameWithoutWww === domain && url.hostname !== currentHostname) {
            // Convert hardcoded source domain links to relative paths
            element.setAttribute(attr, url.pathname + url.search + url.hash);
          }
        } catch(e) {
          // Not a valid URL, skip
        }
      }
    }
  }

  // For domain mode on a translated host: rewrite absolute originalDomain
  // refs to relative paths so the browser keeps requests on the translated host.
  if (translationMode == 'domain' && originalDomainHost) {
    const currentHostname = window.location.hostname;
    if (currentHostname !== originalDomainHost && currentHostname !== `www.${originalDomainHost}`) {
      const allElements = window.document.querySelectorAll('[href], [src]');
      for (let element of allElements) {
        if (element.closest('.globalseo-lang-selector-wrapper')) continue;
        const rel = element.getAttribute('rel');
        if (rel === 'alternate' || rel === 'canonical') continue;
        for (let attr of ['href', 'src']) {
          const value = element.getAttribute(attr);
          if (!value) continue;
          if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('//')) continue;
          try {
            const url = new URL(value, window.location.origin);
            const hostnameWithoutWww = url.hostname.replace(/^www\./, '');
            if (hostnameWithoutWww === originalDomainHost && url.hostname !== currentHostname) {
              element.setAttribute(attr, url.pathname + url.search + url.hash);
            }
          } catch(e) { /* not a URL, skip */ }
        }
      }
    }
  }
}

module.exports = replaceLinks;
