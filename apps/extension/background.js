// JobQuest Capture Extension — Background Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // Open options page on fresh install so the user can configure their instance URL and token
    chrome.runtime.openOptionsPage()
  }
})
