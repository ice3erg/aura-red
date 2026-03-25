(function () {
  const DEFAULT_CENTER = [59.9343, 30.3351];
  const DEFAULT_ZOOM   = 13;

  const map = L.map('map', { zoomControl:true, attributionControl:false })
    .setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { maxZoom:20, subdomains:'abcd' }).addTo(map);

  // youMarker — создаём позже когда знаем аватарку
  let youMarker = null;

  function makeYouIcon(user) {
    const size = 44;
    let inner = '';
    if (user?.avatar) {
      inner = `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      const init = (user?.name || 'Я')[0].toUpperCase();
      inner = `<div class="ava-init" style="font-size:17px;">${init}</div>`;
    }
    return L.divIcon({
      className: '',
      html: `<div class="ava-marker you" style="width:${size}px;height:${size}px;position:relative;border-color:#fff;box-shadow:0 0 20px rgba(255,255,255,.9),0 0 40px rgba(255,43,43,.3);">
        ${inner}
      </div>`,
      iconSize: [size, size], iconAnchor: [size/2, size/2],
    });
  }

  async function initYouMarker() {
    let user = window._auraCurrentUser;
    if (!user) {
      try { const r = await fetch('/api/auth/me'); const d = await r.json(); if (d.ok) user = d.user; } catch(_) {}
    }
    youMarker = L.marker(DEFAULT_CENTER, { icon: makeYouIcon(user), zIndexOffset: 1000 }).addTo(map);
    return user;
  }

  // ── Mock data (fallback) ──────────────────────────────────
  const MOCK_USERS = [
    { id:'m1', name:'Алина', city:'', track:'Гостиница Космос', artist:'Mnogoznaal', image:'', matchType:'same-track',  lat:59.9386, lng:30.3141, distKm:0.4 },
    { id:'m2', name:'Макс',  city:'', track:'Гостиница Космос', artist:'Mnogoznaal', image:'', matchType:'same-track',  lat:59.9278, lng:30.3476, distKm:1.2 },
    { id:'m3', name:'Соня',  city:'', track:'Минус 40',         artist:'Mnogoznaal', image:'', matchType:'same-artist', lat:59.9449, lng:30.3831, distKm:2.1 },
    { id:'m4', name:'Даня',  city:'', track:'Night Drive',      artist:'Phonk Archive', image:'', matchType:'same-vibe', lat:59.9175, lng:30.3014, distKm:3.0 },
  ];

  // ── Render ────────────────────────────────────────────────
  function renderUsers(users) {
    if (window._radarMarkers) window._radarMarkers.forEach(m => map.removeLayer(m));
    window._radarMarkers = [];
    let t = 0, a = 0, v = 0;

    users.forEach(u => {
      const mt = u.matchType || u.type || 'same-vibe';
      if (mt === 'same-track')  t++;
      if (mt === 'same-artist') a++;
      if (mt === 'same-vibe')   v++;

      const m = L.marker([u.lat, u.lng], { icon: makeIcon(mt, u) }).addTo(map);
      m.on('click', e => { L.DomEvent.stopPropagation(e); openSheet({ ...u, matchType:mt }); });
      window._radarMarkers.push(m);
    });

    document.getElementById('cntTrack').textContent  = t;
    document.getElementById('cntArtist').textContent = a;
    document.getElementById('cntVibe').textContent   = v;
  }

  // ── Icon с аватаркой ──────────────────────────────────────
  function makeIcon(type, user) {
    if (type === 'you') {
      return L.divIcon({ className:'', html:'<div class="radar-marker you"></div>', iconSize:[22,22], iconAnchor:[11,11] });
    }
    const size = { 'same-track':40, 'same-artist':36, 'same-vibe':32 }[type] || 36;
    const fs   = Math.round(size * 0.38);
    let inner  = '';
    if (user?.avatar) {
      inner = `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      const init = (user?.name || '?')[0].toUpperCase();
      inner = `<div class="ava-init" style="font-size:${fs}px;">${init}</div>`;
    }
    return L.divIcon({
      className: '',
      html: `<div class="ava-marker ${type}" style="width:${size}px;height:${size}px;position:relative;">
        <div class="ava-pulse"></div>${inner}</div>`,
      iconSize: [size,size], iconAnchor: [size/2,size/2],
    });
  }

  // ── Sheet ─────────────────────────────────────────────────
  const backdrop = document.getElementById('sheetBackdrop');
  let _sheetUser = null;

  const BADGES = {
    'same-track':  '🔴 тот же трек',
    'same-artist': '⚪ тот же артист',
    'same-vibe':   '⚫ похожий вайб',
  };

  function openSheet(u) {
    _sheetUser = u;
    const mt = u.matchType || 'same-vibe';

    document.getElementById('sheetName').textContent        = u.name;
    document.getElementById('sheetCity').textContent        = u.city ? `📍 ${u.city}` : '';
    document.getElementById('sheetBadge').textContent       = BADGES[mt] || '';
    document.getElementById('sheetBadge').className         = 'match-badge ' + mt;
    document.getElementById('sheetTrackName').textContent   = u.track  || '—';
    document.getElementById('sheetTrackArtist').textContent = u.artist || '—';

    // Аватарка
    const avaEl = document.getElementById('sheetAva');
    if (avaEl) {
      if (u.avatar) {
        avaEl.innerHTML = `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      } else {
        const init = (u.name || '?')[0].toUpperCase();
        avaEl.innerHTML = `<span style="font-size:20px;font-weight:800;">${init}</span>`;
      }
    }

    // Обложка
    const cover = document.getElementById('sheetCover');
    if (u.image) { cover.src = u.image; cover.style.display = ''; }
    else         { cover.style.display = 'none'; }

    // Совпадение по ауре
    const auraTexts = {
      'same-track':  '🔴 Тот же трек — максимальное совпадение',
      'same-artist': '⚪ Тот же исполнитель — высокое совпадение',
      'same-vibe':   '⚫ Похожий вайб — есть что-то общее'
    };
    const auraVal = document.getElementById('sheetAuraValue');
    if (auraVal) { auraVal.textContent = auraTexts[mt] || '—'; auraVal.className = 'aura-match-value ' + mt; }

    // Кнопка сигнала
    const signalBtn = document.getElementById('sheetSignalBtn');
    if (signalBtn) {
      signalBtn.textContent = '📡 Отправить сигнал';
      signalBtn.className   = 'sheet-btn signal';
      signalBtn.disabled    = false;
      signalBtn._userId     = u.id || u.userId;
    }

    backdrop.classList.add('open');
  }

  function closeSheet() { backdrop.classList.remove('open'); }

  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeSheet(); });
  map.on('click', closeSheet);

  // Отправка сигнала
  document.getElementById('sheetSignalBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('sheetSignalBtn');
    const toId = btn._userId;
    if (!toId || btn.disabled) return;
    btn.textContent = 'Отправляем...'; btn.disabled = true;
    try {
      const u   = _sheetUser;
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toId, type:'wave', track:u.track||'', artist:u.artist||'', matchType:u.matchType||'same-vibe' })
      });
      const data = await res.json();
      if (res.ok && data.ok) { btn.textContent = '✓ Сигнал отправлен'; btn.className = 'sheet-btn sent'; }
      else if (res.status === 409) { btn.textContent = '✓ Уже отправлен'; btn.className = 'sheet-btn sent'; }
      else { btn.textContent = '📡 Отправить сигнал'; btn.disabled = false; }
    } catch { btn.textContent = '📡 Отправить сигнал'; btn.disabled = false; }
  });

  // ── Now Playing (topbar) ──────────────────────────────────
  async function loadNowPlaying(user) {
    try {
      let data = null;
      // Last.fm приоритет
      if (user?.lastfmConnected && user?.lastfmUsername) {
        const r = await fetch(`/api/lastfm/current-track?username=${encodeURIComponent(user.lastfmUsername)}`);
        const d = await r.json();
        if (d.ok && d.track && d.isPlaying) data = d;
      }
      // Spotify fallback
      if (!data && user?.spotifyConnected) {
        const r = await fetch('/api/spotify/current-track');
        const d = await r.json();
        if (d.ok && d.track) data = d;
      }
      if (data?.track?.name) {
        document.getElementById('topbarTrack').textContent  = data.track.name;
        document.getElementById('topbarArtist').textContent = data.track.artists || '—';
      }
    } catch (_) {}
  }

  // ── Geo + Radar ───────────────────────────────────────────
  async function loadRadar(lat, lng) {
    try {
      const r = await fetch(`/api/radar/nearby?lat=${lat}&lng=${lng}&radius=5`);
      const d = await r.json();
      if (r.ok && d.ok && d.users && d.users.length > 0) {
        renderUsers(d.users);
        const miniCount = document.getElementById('miniMapCount');
        if (miniCount) miniCount.textContent = `${d.count} ${d.count===1?'человек':'людей'} рядом`;
        return;
      }
    } catch (_) {}
    renderUsers(MOCK_USERS);
  }

  function initGeo(user) {
    if (!navigator.geolocation) { renderUsers(MOCK_USERS); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude:lat, longitude:lng } = pos.coords;
      map.setView([lat, lng], DEFAULT_ZOOM);
      if (youMarker) youMarker.setLatLng([lat, lng]);
      loadRadar(lat, lng);
    }, () => { renderUsers(MOCK_USERS); });
  }

  // ── Init ──────────────────────────────────────────────────
  async function init() {
    const user = await initYouMarker();
    loadNowPlaying(user);
    initGeo(user);
  }
  init();
})();
