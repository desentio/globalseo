const { getGlobalseoOptions, OLD_EXCLUDE_CLASS } = require("../configs");

function isExcludedClassName(window,className) {
  const globalseoOptions = getGlobalseoOptions(window);

  return className.includes(OLD_EXCLUDE_CLASS) || className.includes("globalseo-exclude") || globalseoOptions.excludeClasses.length && globalseoOptions.excludeClasses.some(excludeClass => excludeClass && className.includes(excludeClass))
}
exports.isExcludedClassName = isExcludedClassName;

function isInsideExcludedElement(window, node) {
  let current = node.nodeType === 3 ? node.parentNode : node; // 3 = TEXT_NODE
  while (current) {
    if (current.className && typeof current.className === "string" && isExcludedClassName(window, current.className)) {
      return true;
    }
    if (current.id && typeof current.id === "string" && isExcludedId(window, current.id)) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}
exports.isInsideExcludedElement = isInsideExcludedElement;

function isExcludedId(window, id) {
  if (!id) return false;
  
  const globalseoOptions = getGlobalseoOptions(window);

  return globalseoOptions.excludeIds.length && globalseoOptions.excludeIds.some(excludeId => excludeId && id.includes(excludeId))
}
exports.isExcludedId = isExcludedId;

function isExcludedPath(window) {
  const globalseoOptions = getGlobalseoOptions(window);
  const path = window.location.pathname;
  const isActivePathEndedWithSlash = path.endsWith('/');
  const withoutSlashPath = isActivePathEndedWithSlash ? path.slice(0, -1) : path;

  return globalseoOptions.excludePaths.length && globalseoOptions.excludePaths.some(excludePath => {
    if (!excludePath) return false;
    const isEndedWithStar = excludePath.endsWith('/*');
    if (isEndedWithStar) return path.startsWith(excludePath.slice(0, -1));
    return (path === excludePath) || (withoutSlashPath == excludePath);
  })
}
exports.isExcludedPath = isExcludedPath;
