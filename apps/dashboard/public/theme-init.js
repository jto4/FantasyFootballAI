// A local blocking script restores appearance before paint without weakening script-src 'self'.
(() => {
  let theme = 'light';
  try {
    const desktop = window.sidekickDesktop;
    const saved = desktop?.getTheme
      ? desktop.getTheme()
      : localStorage.getItem('sidekick.theme.v1');
    if (saved === 'dark') theme = 'dark';
  } catch {
    // White remains the default when browser storage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
})();
