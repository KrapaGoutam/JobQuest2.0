// JobQuest Capture Extension — Background Service Worker (Manifest V3)

// Make the toolbar icon open the Side Panel (the primary UI as of Phase C)
// instead of a popup. popup.html/js remain in place, untouched, but are no
// longer the default action target — see manifest.json's `action` (no more
// `default_popup`) and `side_panel.default_path`.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err))

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // Open options page on fresh install so the user can configure their instance URL and token
    chrome.runtime.openOptionsPage()
  }
})
