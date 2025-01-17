const getUnprefixedPathname = require("./utils/translation-mode/getUnprefixedPathname");

function replaceLinks(window, {langParam, lang, translationMode, prefix, sourceOriginHostname, sourceOrigin}) {
  // Select all anchor tags
  const anchors = window.document.querySelectorAll('a:not(.globalseo-ignore-link)');

  // domain
  const domain = window.location.hostname.split('.').slice(1).join('.');

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

    // assign full url if it's relative path
    if (!anchor.href.startsWith("http") && !anchor.href.startsWith("tel:") && !anchor.href.startsWith("mailto:")) {
      const currentUrl = new URL(sourceOrigin || window.location.href);
      const fullHref = `${currentUrl.protocol}//${currentUrl.hostname}${anchor.href}`;
      anchor.href = fullHref;
    }

    // check for en.domain.com OR www.domain.com OR domain.com
    const isInternal = (anchor.hostname == `${lang}.${domain}`) || (anchor.hostname == `www.${domain}`) || anchor.hostname == window.location.hostname;

    const isInternalForSubdirectory = translationMode == "subdirectory" && (anchor.hostname == sourceOriginHostname || anchor.hostname == `www.${sourceOriginHostname}`);

    if (!isInternal && !isInternalForSubdirectory) {
      // Check if the link is external
      continue;
    }

    if (translationMode == 'subdomain') {
      // Create a new URL object
      let url = new URL(anchor.href);

      // append the first subdomain with lang
      // google.com -> en.google.com
      // let subdomains = url.hostname.split('.');
      // subdomains.splice(0, 0, lang);
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
    } else if (anchor.pathname != window.location.pathname) {
      // Check if the link is internal and does not contain a hash

      // Create a new URL object
      let url = new URL(anchor.href);

      // Set the search parameter "lang" to lang
      url.searchParams.set(langParam, lang);

      // Update the href of the anchor tag
      anchor.href = url.href;
      // console.log("anchor.href searchParams", anchor.href)
    }
  }
}

module.exports = replaceLinks;
