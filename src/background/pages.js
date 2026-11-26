export function pageTabs() {
  const url = [...new Set(chrome.runtime.getManifest().content_scripts.flatMap((script) => script.matches))];
  return chrome.tabs.query({ url }).catch(() => []);
}
