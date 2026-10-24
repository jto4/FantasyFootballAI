// A local blocking script restores appearance before paint without weakening script-src 'self'.
(() => {
  let theme = 'light';
  try {
    const desktop = window.sidekickDesktop;
    const saved = desktop?.getTheme
      ? desktop.getTheme()
      : localStorage.getItem('sidekick.theme.v1');
    if (saved === 'dark') theme = 'dark';
    if (saved === 'system')
      theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.themePreference =
      saved === 'dark' || saved === 'system' ? saved : 'light';
    // Device display choices (text size, density, motion) apply before paint too.
    const display = JSON.parse(localStorage.getItem('sidekick.display.v1') || '{}');
    if (['small', 'large', 'larger'].includes(display.textSize))
      document.documentElement.dataset.textSize = display.textSize;
    if (display.density === 'compact') document.documentElement.dataset.density = 'compact';
    if (display.motion === 'reduced') document.documentElement.dataset.motion = 'reduced';
  } catch {
    // White remains the default when browser storage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
})();
