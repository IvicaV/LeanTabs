(function() {
  try {
    // 1. Check if user already manually selected a theme
    let theme = localStorage.getItem('theme');

    // 2. If NO, check system preference
    if (!theme) {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        theme = 'dark';
      } else {
        theme = 'light';
      }
    }

    // 3. Set Theme
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    console.log('Theme load error:', e);
  }
})();