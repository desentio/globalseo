// Batches items pushed under the same key across a delay window into ONE flush call.
//
// This replaces a cancel-and-replace debounce that used to keep a SINGLE global timer
// shared by every call to getTranslationsFromAPI: each call cleared the previous timer, so
// only the LAST call's work ever ran when two calls landed within the delay window — the
// earlier call's mainFunction, and the resolve() inside it, never fired at all. That call's
// promise hung forever and its strings were never actually sent to /get-translations.
//
// This queues instead of cancelling: every item pushed under a key is guaranteed to appear
// in exactly one onFlush call. Trailing-edge timing is unchanged (a push still resets the
// timer to `delay` ms out) — the only difference is nothing gets dropped along the way.
// getTranslationsFromAPI.js uses this to merge concurrent calls for the same
// (apiKey, language, pathname) into a single /get-translations request instead of firing
// one per call.
function getQueues(window) {
  if (!window.globalseoBatchQueues) window.globalseoBatchQueues = new Map();
  return window.globalseoBatchQueues;
}

function batchDebounce(window, key, item, onFlush, delay = 2000, maxWait = delay * 4) {
  const queues = getQueues(window);
  let entry = queues.get(key);
  if (!entry) {
    entry = { items: [], timer: null, firstPushAt: Date.now() };
    queues.set(key, entry);
  }
  entry.items.push(item);

  // Trailing-edge debounce with a max-wait cap: each push defers the flush by `delay`, but
  // never past `maxWait` after the batch's FIRST push. Without the cap, a page producing
  // new strings faster than `delay` (heavy hydration, streaming content) would defer the
  // flush indefinitely — nothing would be dropped anymore, but the queue would grow
  // unboundedly and no request would go out until the churn stopped.
  const remaining = Math.max(0, maxWait - (Date.now() - entry.firstPushAt));
  window.clearTimeout(entry.timer);
  entry.timer = window.setTimeout(() => {
    queues.delete(key);
    onFlush(entry.items);
  }, Math.min(delay, remaining));
}

module.exports = {
  batchDebounce,
};
