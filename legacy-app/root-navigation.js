/* Cross the marketing-root boundary by full navigation; leave app, auth, and API routes untouched. */
(() => {
  function homeDestination(url) {
    if (url === undefined || url === null) return null;
    let destination;
    try { destination = new URL(url, window.location.href); } catch { return null; }
    return destination.origin === window.location.origin && destination.pathname === '/' ? destination : null;
  }
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
    const destination = homeDestination(anchor.href);
    if (!destination) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(destination.href);
  }, true);
  for (const [method, navigation] of [['pushState', 'assign'], ['replaceState', 'replace']]) {
    const original = window.history[method];
    window.history[method] = function (...args) {
      const destination = homeDestination(args[2]);
      if (destination) {
        window.location[navigation](destination.href);
        return;
      }
      return original.apply(this, args);
    };
  }
  window.addEventListener('popstate', (event) => {
    const destination = homeDestination(window.location.href);
    if (!destination) return;
    event.stopImmediatePropagation();
    window.location.replace(destination.href);
  }, true);
})();
