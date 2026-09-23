// Shiralong content script: reads the Spotify web player's now-playing bar and shows
// Hebrew lyrics + English translation in a side panel, in sync with playback.
(() => {
  'use strict';
  if (window.__shiralong) { try { window.__shiralong.open(); } catch {} return; }
  window.__shiralong = { open: () => {} };

  const SITE = 'https://shiralong.github.io/';
  const ID_RE = /(?:\/track\/|spotify:track:)([A-Za-z0-9]{22})/;

  // ---------- State ----------
  let songs = {};
  let songsLoadedAt = 0;
  let track = null;          // {id, title, artist}
  let playing = false;
  let baseSec = 0, baseAt = 0, lastPosText = '';
  let song = null, lineEls = [], lastIdx = -1, isStatic = false;
  let offset = 0;            // seconds, per track
  let open = true;

  // ---------- Panel ----------
  const panel = document.createElement('aside');
  panel.id = 'shiralong-panel';
  panel.innerHTML = `
    <div class="sl-head">
      <span class="sl-dot"></span>
      <div class="sl-now"><div class="sl-title">Shiralong</div><div class="sl-artist">Play a song to see its lyrics</div></div>
      <button class="sl-btn sl-off" title="Lyrics earlier (−0.5 s)">−</button>
      <span class="sl-offval" title="Timing offset">0.0</span>
      <button class="sl-btn sl-off" title="Lyrics later (+0.5 s)">+</button>
      <button class="sl-btn sl-close" title="Hide">×</button>
    </div>
    <div class="sl-body"><div class="sl-stage"></div></div>
    <div class="sl-grip" title="Drag to resize"></div>`;
  document.documentElement.appendChild(panel);
  const pill = document.createElement('button');
  pill.id = 'shiralong-pill'; pill.textContent = 'Shiralong'; pill.title = 'Show lyrics';
  pill.onclick = () => setOpen(true);
  document.documentElement.appendChild(pill);
  const $ = (sel) => panel.querySelector(sel);
  const stage = $('.sl-stage'), body = $('.sl-body');
  const [btnMinus, btnPlus] = panel.querySelectorAll('.sl-off');
  btnMinus.onclick = () => setOffset(offset - 0.5);
  btnPlus.onclick = () => setOffset(offset + 0.5);
  $('.sl-close').onclick = () => setOpen(false);

  window.__shiralong.open = () => setOpen(true);
  function setOpen(v) {
    open = v;
    panel.classList.toggle('sl-hidden', !open);
    pill.classList.toggle('sl-show', !open);
    document.documentElement.classList.toggle('shiralong-open', open);
    try { chrome.storage.local.set({ open }); } catch {}
  }
  try { chrome.storage.local.get(['open'], (r) => setOpen(r.open !== false)); } catch { setOpen(true); }
  try { chrome.runtime.onMessage.addListener((m, _s, reply) => { if (m && (m.type === 'toggle' || m.type === 'show')) { setOpen(m.type === 'show' ? true : !open); reply && reply({ ok: true }); } }); } catch {}

  // Resizable width (drag the left edge), remembered across sessions
  function setWidth(w) {
    w = Math.max(280, Math.min(Math.round(w), Math.round(window.innerWidth * 0.8)));
    document.documentElement.style.setProperty('--sl-w', w + 'px');
    try { chrome.storage.local.set({ width: w }); } catch {}
  }
  try { chrome.storage.local.get(['width'], (r) => { if (r.width) setWidth(r.width); }); } catch {}
  $('.sl-grip').addEventListener('mousedown', (e) => {
    e.preventDefault(); panel.classList.add('sl-resizing');
    const move = (ev) => setWidth(window.innerWidth - ev.clientX);
    const up = () => { panel.classList.remove('sl-resizing'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  });

  function setOffset(v) {
    offset = Math.round(v * 10) / 10;
    $('.sl-offval').textContent = (offset >= 0 ? '+' : '') + offset.toFixed(1);
    if (track) try { chrome.storage.local.set({ ['off_' + track.id]: offset }); } catch {}
  }

  function message(html) { stage.innerHTML = `<div class="sl-msg">${html}</div>`; lineEls = []; song = null; }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().replace(/\s*[\(\[\-–].*$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  // ---------- Library ----------
  function loadSongs() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'getSongs' }, (res) => {
          if (res && res.songs) { songs = res.songs; songsLoadedAt = Date.now(); }
          resolve();
        });
      } catch { resolve(); }
    });
  }

  function findSong(tr) {
    if (songs[tr.id]) return songs[tr.id];
    // fall back to title + first artist match (track IDs differ between releases of the same recording)
    const t = norm(tr.title), a = norm(tr.artist.split(',')[0]);
    for (const s of Object.values(songs)) {
      if (norm(s.title) === t && (!a || norm((s.artist || '').split(',')[0]) === a)) return s;
    }
    return null;
  }

  // ---------- Render ----------
  async function renderForTrack() {
    lineEls = []; lastIdx = -1; song = null;
    $('.sl-title').textContent = track ? track.title : 'Shiralong';
    $('.sl-artist').textContent = track ? track.artist : 'Play a song to see its lyrics';
    if (!track) { message('<h2>Shiralong</h2><p>Hebrew lyrics with English translation. Play a song in Spotify and they appear here.</p>'); return; }
    try { chrome.storage.local.get(['off_' + track.id], (r) => setOffset(Number(r['off_' + track.id] || 0))); } catch { setOffset(0); }
    if (Date.now() - songsLoadedAt > 5 * 60 * 1000) await loadSongs();
    song = findSong(track);
    if (!song || !song.lines || !song.lines.length) {
      const q = encodeURIComponent(`${track.title} ${track.artist}`);
      message(`<h2>No lyrics yet</h2><p>This song isn't in the Shiralong library.</p>
        <p><a href="${SITE}" target="_blank" rel="noopener">Open Shiralong</a> to see how to add it.</p>`);
      return;
    }
    isStatic = /untimed$/.test(song.source || '') || !song.lines.some((l) => l.t != null);
    stage.innerHTML = '';
    stage.classList.toggle('sl-static', isStatic);
    if (isStatic) {
      const n = document.createElement('div'); n.className = 'sl-note'; n.textContent = 'Lyrics without timings — scroll by hand'; stage.appendChild(n);
    }
    for (const ln of song.lines) {
      const d = document.createElement('div');
      d.className = isStatic ? 'sl-line' : 'sl-line sl-upcoming';
      d.innerHTML = `<span class="sl-he">${esc(ln.he || '')}</span><span class="sl-en">${esc(ln.en || '')}</span>`;
      stage.appendChild(d); lineEls.push(d);
    }
    body.scrollTop = 0;
  }

  function nowSec() {
    return playing ? baseSec + (performance.now() - baseAt) / 1000 : baseSec;
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!song || isStatic || !lineEls.length) return;
    const t = nowSec() - offset;
    const lines = song.lines;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) { if (t >= lines[i].t) idx = i; else break; }
    for (let i = 0; i < lines.length; i++) {
      const cls = i < idx ? 'sl-line sl-done' : i === idx ? 'sl-line sl-current' : 'sl-line sl-upcoming';
      if (lineEls[i].className !== cls) lineEls[i].className = cls;
    }
    if (idx !== lastIdx) {
      lastIdx = idx;
      if (idx >= 0) {
        const el = lineEls[idx];
        body.scrollTo({ top: el.offsetTop - body.clientHeight / 2 + el.offsetHeight / 2, behavior: 'smooth' });
      }
    }
  }

  // ---------- Reading the Spotify player ----------
  const parseTime = (s) => {
    const m = String(s || '').trim().match(/^(?:(\d+):)?(\d+):(\d\d)$/);
    if (!m) return null;
    return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]);
  };

  function readPlayer() {
    const widget = document.querySelector('[data-testid="now-playing-widget"]');
    const bar = document.querySelector('[data-testid="now-playing-bar"]') || document.querySelector('footer');
    if (!widget) { if (track) { track = null; renderForTrack(); } $('.sl-dot').classList.remove('sl-on'); return; }
    $('.sl-dot').classList.add('sl-on');

    // Track identity
    let id = null;
    for (const a of widget.querySelectorAll('a[href]')) {
      const m = a.getAttribute('href').match(ID_RE); if (m) { id = m[1]; break; }
    }
    const titleEl = widget.querySelector('[data-testid="context-item-link"], [data-testid="context-item-info-title"] a, [data-testid="context-item-info-title"]');
    const artistEls = widget.querySelectorAll('[data-testid="context-item-info-artist"], a[href^="/artist/"]');
    let title = titleEl ? titleEl.textContent.trim() : '';
    let artist = [...artistEls].map((a) => a.textContent.trim()).filter(Boolean).join(', ');
    if (!title) { // fall back to the document title "Song • Artist"
      const m = document.title.match(/^(.*?)\s+[•·]\s+(.*)$/); if (m) { title = m[1]; artist = artist || m[2]; }
    }
    if (!id && !title) return;
    const key = id || (title + '|' + artist);
    if (!track || track.key !== key) {
      track = { key, id: id || '', title, artist };
      lastPosText = ''; baseSec = 0; baseAt = performance.now();
      renderForTrack();
    }

    // Play state
    const pp = (bar || document).querySelector('[data-testid="control-button-playpause"]');
    if (pp) {
      const label = (pp.getAttribute('aria-label') || '').toLowerCase();
      playing = label.startsWith('pause') || label.includes('השהה');
    }

    // Position: the elapsed-time text updates once a second; we interpolate between updates.
    const posEl = (bar || document).querySelector('[data-testid="playback-position"]');
    const txt = posEl ? posEl.textContent : '';
    if (txt && txt !== lastPosText) {
      const sec = parseTime(txt);
      if (sec != null) {
        lastPosText = txt;
        const expected = nowSec();
        if (Math.abs(expected - sec) > 0.35 || !playing) { baseSec = sec; baseAt = performance.now(); }
        else { baseSec = sec; baseAt = performance.now(); }
      }
    }
  }

  // ---------- Boot ----------
  loadSongs().then(() => { renderForTrack(); });
  setInterval(readPlayer, 250);
  frame();
})();
