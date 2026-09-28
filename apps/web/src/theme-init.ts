// JobQuest 2.0 Theme Initializer (Anti-FOUC)
// Runs synchronously before DOM render to set initial data-theme
try {
  const stored = localStorage.getItem('jobquest-theme') || 'system';
  const isDark = stored === 'dark' || (stored === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-jq', '');
} catch {
  document.documentElement.setAttribute('data-theme', 'light');
}
