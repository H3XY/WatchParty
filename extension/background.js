// background.js — service worker
// Relays messages between popup and content scripts

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_ACTIVE_TAB_URL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ url: tabs[0]?.url || '' });
    });
    return true; // async
  }

  if (message.type === 'INJECT_PARTY') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        sendResponse(response);
      });
    });
    return true;
  }

  if (message.type === 'PARTY_STATUS') {
    // Content script reporting back status to popup
    chrome.runtime.sendMessage(message).catch(() => {});
  }
});
