// Fetches the song library from shiralong.github.io on behalf of the content script
// (content scripts can't always fetch cross-origin; the service worker can, thanks to host_permissions).
const BASE = 'https://shiralong.github.io/';

async function fetchJson(file) {
  const r = await fetch(BASE + file + '?t=' + Math.floor(Date.now() / 300000), { cache: 'no-store' });
  if (!r.ok) throw new Error(file + ' ' + r.status);
  return r.json();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'getSongs') {
    (async () => {
      const songs = {};
      for (const f of ['songs.json', 'songs_added.json']) {
        try { Object.assign(songs, await fetchJson(f)); } catch (e) { /* file may be missing */ }
      }
      sendResponse({ songs });
    })();
    return true; // async response
  }
});

// Clicking the toolbar icon toggles the panel in the active Spotify tab, or opens Spotify if none.
chrome.action.onClicked.addListener(async (tab) => {
  if (!(tab && tab.url && tab.url.startsWith('https://open.spotify.com/'))) {
    chrome.tabs.create({ url: 'https://open.spotify.com/' });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'show' });
  } catch (e) {
    // No live content script in this tab (page loaded before the extension was installed/updated): inject it now.
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['panel.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch (err) { console.warn('Shiralong: could not inject', err); }
  }
});
