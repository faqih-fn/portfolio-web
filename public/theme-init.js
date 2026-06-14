// public/theme-init.js
// No-flash theme bootstrap (F-05.3, D-3). The shipped CSP (public/_headers) is
// `script-src 'self' https://challenges.cloudflare.com` with NO 'unsafe-inline',
// so this CANNOT be an inline <head> snippet. It ships as a same-origin external
// file referenced via <script is:inline src="/theme-init.js"></script> in the
// layout <head> — a classic render-blocking same-origin script: no flash, CSP-clean.
// It hydrates nothing, so it is part of the ThemeToggle feature, NOT a fourth island.
(function () {
  try {
    var stored = localStorage.getItem('theme'); // 'dark' | 'light' | null
    var prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : prefersDark;
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {
    // localStorage may be unavailable (private mode); fall back to light, no throw.
  }
})();
