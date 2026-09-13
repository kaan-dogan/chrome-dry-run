chrome.runtime.onMessage.addListener((m) => {
  if (m && m.type === 'dryrun') document.dispatchEvent(new CustomEvent('__dryrun_go'));
});
