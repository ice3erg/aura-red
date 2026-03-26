(function () {
  const U = window.AuraUtils;
  const DEFAULT = [59.9343, 30.3351];

  // ── Map init ─────────────────────────────────────────────
  const map = L.map('map', {
    zoomControl: false, attributionControl: false,
    dragging: true, scrollWheelZoom: true,
    doubleClickZoom: true, touchZoom: true,
  }).setView(DEFAULT, 14);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20, subdomains: 'abcd', attribution: ''
  }).addTo(map);

  // ── State ────────────────────────────────────────────────
  let _user = null;
  let _youMarker = null;
  let _radarMarkers = [];
  let _sentSignalTo = new Set();
  let _lastPos = null;
  let _currentTrack = null;

  // ── Geo ──────────────────────────────────────────────────
  function getGeo() {
    return new Promise(res => {
      if (!navigator.geolocation) { res(null); return; }
      if (_lastPos && Date.now() - _lastPos.ts < 120000) { res(_lastPos); return; }
      navigator.geolocation.getCurrentPosition(
        p => {
          _lastPos = { lat: p.coords.latitude, lng: p.coords.longitude, ts: Date.now() };
          res(_lastPos);
        },
        () => res(_lastPos),
        { timeout: 8000, maximumAge: 60000, enableHighAccuracy: false }
      );
    });
  }

  // ── You marker ───────────────────────────────────────────
  function makeYouIcon(user) {
    const size = 48;
    const inner = user?.avatar
      ? `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : `<div class="ava-init" style="font-size:18px;">${(user?.name || 'Я')[0].toUpperCase()}</div>`;
    return L.divIcon({
      className: '',
      html: `<div class="you-marker" style="width:${size}px;height:${size}px;">
               <div class="you-ring"></div>
               ${inner}
             </div>`,
      iconSize: [size, size], iconAnchor: [size/2, size/2],
    });
  }

  // ── Other markers ────────────────────────────────────────
  function makeIcon(u, sent) {
    const mt = u.matchType || 'same-vibe';
    const size = mt === 'same-track' ? 44 : 38;
    const fs = Math.round(size * 0.38);
    const inner = u.avatar
      ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : `<div class="ava-init" style="font-size:${fs}px;">${(u.name || '?')[0].toUpperCase()}</div>`;

    const sentBadge = sent
      ? `<div style="position:absolute;top:-3px;right:-3px;width:15px;height:15px;border-radius:50%;background:#22c55e;border:2px solid #050505;display:flex;align-items:center;justify-content:center;font-size:8px;z-index:2;">✓</div>`
      : '';

    // Пузырёк с треком для same-track
    const bubble = mt === 'same-track' && u.track
      ? `<div class="track-bubble">${u.track}</div>`
      : '';

    return L.divIcon({
      className: '',
      html: `<div class="ava-marker ${mt}" style="width:${size}px;height:${size}px;position:relative;">
               <div class="ava-pulse"></div>
               ${inner}
               ${sentBadge}
               ${bubble}
             </div>`,
      iconSize: [size, size], iconAnchor: [size/2, size/2],
    });
  }

  // ── Radar ────────────────────────────────────────────────
  function renderUsers(users) {
    _radarMarkers.forEach(m => map.removeLayer(m));
    _radarMarkers = [];

    const relevant = users.filter(u => {
      const mt = u.matchType || 'same-vibe';
      return mt === 'same-track' || mt === 'same-artist';
    });

    relevant.forEach(u => {
      const sent = _sentSignalTo.has(String(u.id || u.userId));
      const m = L.marker([u.lat, u.lng], { icon: makeIcon(u, sent) }).addTo(map);
      m.on('click', e => { L.DomEvent.stopPropagation(e); openSheet({ ...u, signalSent: sent }); });
      _radarMarkers.push(m);
    });

    // Счётчик людей
    const chip = document.getElementById('peopleChip');
    const countEl = document.getElementById('peopleCount');
    if (relevant.length > 0) {
      chip.style.display = 'flex';
      const n = relevant.length;
      countEl.textContent = `${n} ${n === 1 ? 'человек' : n < 5 ? 'человека' : 'людей'} на волне`;
    } else {
      chip.style.display = 'none';
    }

    // Пустое состояние
    let emptyEl = document.getElementById('mapEmpty');
    if (relevant.length === 0 && _currentTrack) {
      if (!emptyEl) {
        emptyEl = document.createElement('div');
        emptyEl.id = 'mapEmpty';
        emptyEl.style.cssText = `
          position:fixed;bottom:calc(80px + env(safe-area-inset-bottom) + 16px);
          left:50%;transform:translateX(-50%);
          background:rgba(10,10,16,0.88);border:1px solid rgba(255,255,255,0.08);
          border-radius:18px;padding:14px 20px;
          backdrop-filter:blur(20px);
          display:flex;align-items:center;gap:10px;
          font-size:13px;font-weight:600;color:rgba(255,255,255,0.6);
          z-index:50;white-space:nowrap;
          box-shadow:0 4px 20px rgba(0,0,0,0.4);
          animation:fadeIn 0.3s ease both;
        `;
        emptyEl.innerHTML = '<span style="font-size:20px;">🔍</span> Никого на волне рядом';
        document.body.appendChild(emptyEl);
      }
      emptyEl.style.display = 'flex';
    } else if (emptyEl) {
      emptyEl.style.display = 'none';
    }
  }

  async function loadRadar(lat, lng) {
    try {
      const r = await fetch(`/api/radar/nearby?lat=${lat}&lng=${lng}&radius=50`);
      const d = await r.json();
      if (r.ok && d.ok && d.users?.length) {
        renderUsers(d.users); return;
      }
    } catch (_) {}
    renderUsers([]);
  }

  // ── Push now playing ─────────────────────────────────────
  async function pushNowPlaying(track) {
    if (!track) return;
    const pos = await getGeo();
    try {
      await fetch('/api/now-playing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track:  track.name    || '',
          artist: track.artists || '',
          album:  track.album   || '',
          image:  track.image   || '',
          url:    track.url     || '',
          source: track.source  || 'spotify',
          lat:    pos?.lat ?? null,
          lng:    pos?.lng ?? null,
        })
      });
    } catch (_) {}
  }

  // ── Now Playing pill ─────────────────────────────────────
  async function loadTrack(user) {
    let track = null;

    if (user.lastfmConnected && user.lastfmUsername) {
      try {
        const r = await fetch(`/api/lastfm/current-track?username=${encodeURIComponent(user.lastfmUsername)}`);
        const d = await r.json();
        if (d.ok && d.track && d.isPlaying) track = d.track;
      } catch (_) {}
    }

    if (!track && user.spotifyConnected) {
      try {
        const r = await fetch('/api/spotify/current-track');
        const d = await r.json();
        if (d.ok && d.track) track = d.track;
      } catch (_) {}
    }

    const pill    = document.getElementById('nowPill');
    const cover   = document.getElementById('npCover');
    const coverPh = document.getElementById('npCoverPh');
    const dot     = document.getElementById('npDot');
    const title   = document.getElementById('npTitle');
    const connect = document.getElementById('npConnect');

    if (track) {
      _currentTrack = track;
      pill.classList.add('has-track');
      dot.classList.remove('idle');

      if (track.image) {
        cover.src = track.image;
        cover.style.display = 'block';
        coverPh.style.display = 'none';
      } else {
        cover.style.display = 'none';
        coverPh.style.display = 'flex';
      }
      title.textContent = `${track.name} · ${track.artists}`;
      connect.style.display = 'none';

      // Beat pulse на карте
      const n = document.getElementById('nowPill');
      n.style.setProperty('--beat-dur', '0.5s');
      n.classList.add('beating');

      pushNowPlaying(track);

      // Обновляем радар с новым треком
      const pos = await getGeo();
      if (pos) loadRadar(pos.lat, pos.lng);

    } else {
      pill.classList.remove('has-track');
      dot.classList.add('idle');
      cover.style.display = 'none';
      coverPh.style.display = 'flex';
      pill.classList.remove('beating');

      if (!user.lastfmConnected && !user.spotifyConnected) {
        title.textContent = 'Подключи музыку';
        connect.style.display = 'flex';
        connect.textContent = 'Подключить';
        connect.href = '/profile';
      } else {
        title.textContent = 'Ничего не играет';
        connect.style.display = 'none';
      }
    }
  }

  // ── Sheet ────────────────────────────────────────────────
  const backdrop = document.getElementById('sheetBackdrop');

  const BADGES = {
    'same-track':  '🔴 тот же трек',
    'same-artist': '⚪ тот же артист',
    'same-vibe':   '⚫ похожий вайб',
  };

  function openSheet(u) {
    const mt = u.matchType || 'same-vibe';

    // Аватар
    const avaEl = document.getElementById('sheetAva');
    avaEl.innerHTML = u.avatar
      ? `<img src="${u.avatar}" />`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;">${(u.name||'?')[0]}</div>`;

    document.getElementById('sheetName').textContent  = u.name || '—';
    document.getElementById('sheetCity').textContent  = u.city ? `📍 ${u.city}` : '';
    const badge = document.getElementById('sheetBadge');
    badge.textContent = BADGES[mt] || '';
    badge.className = 'match-badge ' + mt;

    // Трек
    const coverEl = document.getElementById('sheetCover');
    if (u.image) { coverEl.src = u.image; coverEl.style.display = ''; }
    else coverEl.style.display = 'none';
    document.getElementById('sheetTrackName').textContent   = u.track  || '—';
    document.getElementById('sheetTrackArtist').textContent = u.artist || '—';

    // Кнопка сигнала
    const btn = document.getElementById('sheetSignalBtn');
    btn._userId = u.id || u.userId;
    if (u.signalSent) {
      btn.textContent = '✓ Сигнал отправлен';
      btn.className = 'sheet-btn sent';
      btn.disabled = true;
    } else {
      btn.textContent = '📡 Отправить сигнал';
      btn.className = 'sheet-btn signal';
      btn.disabled = false;
    }

    backdrop.classList.add('open');
  }

  function closeSheet() { backdrop.classList.remove('open'); }

  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeSheet(); });
  map.on('click', closeSheet);

  // Сигнал
  document.getElementById('sheetSignalBtn').addEventListener('click', async () => {
    const btn = document.getElementById('sheetSignalBtn');
    if (btn.disabled) return;
    const toId = btn._userId;
    btn.textContent = '...'; btn.disabled = true;
    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toId, type: 'wave', track: _currentTrack?.name || '', artist: _currentTrack?.artists || '', matchType: 'same-track' })
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        btn.textContent = '✓ Сигнал отправлен';
        btn.className = 'sheet-btn sent';
        _sentSignalTo.add(String(toId));
        const pos = await getGeo();
        if (pos) loadRadar(pos.lat, pos.lng);
      } else if (res.status === 409) {
        btn.textContent = '✓ Уже отправлен'; btn.className = 'sheet-btn sent';
      } else {
        btn.textContent = '📡 Отправить сигнал'; btn.className = 'sheet-btn signal'; btn.disabled = false;
      }
    } catch { btn.textContent = '📡 Отправить сигнал'; btn.className = 'sheet-btn signal'; btn.disabled = false; }
  });

  // ── Locate button ─────────────────────────────────────────
  document.getElementById('locateBtn').addEventListener('click', async () => {
    const pos = await getGeo();
    if (pos) map.flyTo([pos.lat, pos.lng], 15, { duration: 0.8 });
  });

  // ── Sent signals ─────────────────────────────────────────
  async function loadSentSignalIds() {
    try {
      const r = await fetch('/api/signals?direction=sent');
      const d = await r.json();
      if (!d.ok) return;
      const sigs = d.sentSignals || d.signals || [];
      _sentSignalTo = new Set(
        sigs.filter(s => s.status === 'pending').map(s => String(s.toId || s.to?.id))
      );
    } catch {}
  }

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    _user = await U.requireAuth();
    if (!_user) return;

    // You marker
    _youMarker = L.marker(DEFAULT, { icon: makeYouIcon(_user), zIndexOffset: 1000 }).addTo(map);

    // Sent signals
    await loadSentSignalIds();

    // Трек — сразу пушим из базы (восстановление после рестарта сервера)
    if (_user.currentTrack?.track) {
      const pos = await getGeo();
      if (pos) {
        fetch('/api/now-playing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...(_user.currentTrack), lat: pos.lat, lng: pos.lng })
        }).catch(() => {});
      }
    }
    loadTrack(_user);
    setInterval(() => loadTrack(_user), 30000);

    // Геолокация
    const pos = await getGeo();
    if (pos) {
      map.setView([pos.lat, pos.lng], 14);
      _youMarker.setLatLng([pos.lat, pos.lng]);
      loadRadar(pos.lat, pos.lng);
    }

    // Keep-alive radar
    setInterval(async () => {
      const p = await getGeo();
      if (p && _currentTrack) {
        pushNowPlaying(_currentTrack);
        loadRadar(p.lat, p.lng);
      }
    }, 90000);
  }

  init();
})();

// Patch applied by build
