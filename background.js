const MENU = { id: 'dryrun', title: 'Dry run — ne gidecek?', contexts: ['all'] };
chrome.runtime.onInstalled.addListener(() => chrome.contextMenus.create(MENU));
chrome.runtime.onStartup.addListener(() =>
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create(MENU)));

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'dryrun' && tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'dryrun' }, { frameId: info.frameId ?? 0 });
  }
});
