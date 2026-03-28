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
  let _acceptedSignalTo = new Set();
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

    // Размер зависит от матча — track самый большой
    const size = mt === 'same-track' ? 46 : mt === 'same-artist' ? 40 : 34;
    const fs = Math.round(size * 0.38);

    const inner = u.avatar
      ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : `<div class="ava-init" style="font-size:${fs}px;">${(u.name || '?')[0].toUpperCase()}</div>`;

    const sentBadge = sent
      ? `<div style="position:absolute;top:-3px;right:-3px;width:15px;height:15px;border-radius:50%;background:#22c55e;border:2px solid #050505;display:flex;align-items:center;justify-content:center;font-size:8px;z-index:2;">✓</div>`
      : '';

    // Пузырёк с треком только для same-track
    const bubble = mt === 'same-track' && u.track
      ? `<div class="track-bubble">${u.track}</div>`
      : '';

    // Демо-маркер полупрозрачный
    const opacity = u.isDemo ? '0.45' : '1';

    return L.divIcon({
      className: '',
      html: `<div class="ava-marker ${mt}" style="width:${size}px;height:${size}px;position:relative;opacity:${opacity};">
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

    // Показываем ВСЕХ — track/artist/vibe, с разными размерами
    const relevant = users; // все пользователи

    window._radarData = relevant; // для подсказок в ручном вводе

    relevant.forEach(u => {
      const sent = _sentSignalTo.has(String(u.id || u.userId));
      const m = L.marker([u.lat, u.lng], { icon: makeIcon(u, sent) }).addTo(map);
      m.on('click', e => { L.DomEvent.stopPropagation(e); openSheet({ ...u, signalSent: sent }); });
      _radarMarkers.push(m);
    });

    // Счётчик — только track+artist как "на волне"
    const onWave = relevant.filter(u => u.matchType === 'same-track' || u.matchType === 'same-artist');
    const chip = document.getElementById('peopleChip');
    const countEl = document.getElementById('peopleCount');
    if (relevant.length > 0) {
      chip.style.display = 'flex';
      if (onWave.length > 0) {
        const n = onWave.length;
        countEl.textContent = `${n} ${n === 1 ? 'человек' : n < 5 ? 'человека' : 'людей'} на волне`;
      } else {
        countEl.textContent = `${relevant.length} слушают рядом`;
      }
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

  // Фейковые пользователи для демо (когда никого нет рядом)
  function getMocks(lat, lng) {
    const spread = 0.018;
    return [
      { userId:'demo1', name:'Саша',  avatar:null, track:'Blindspot', artist:'Travis Scott', matchType:'same-artist', lat:lat+spread*0.7, lng:lng+spread*1.1 },
      { userId:'demo2', name:'Миша',  avatar:null, track:'Telekinesis', artist:'Travis Scott', matchType:'same-track',  lat:lat-spread*0.5, lng:lng+spread*0.8 },
      { userId:'demo3', name:'Лена',  avatar:null, track:'Neon Guts', artist:'Lil Uzi Vert', matchType:'same-vibe',   lat:lat+spread*0.3, lng:lng-spread*1.2 },
      { userId:'demo4', name:'Дима',  avatar:null, track:'Money Trees', artist:'Kendrick Lamar', matchType:'same-vibe', lat:lat-spread*1.1, lng:lng-spread*0.4 },
      { userId:'demo5', name:'Аня',   avatar:null, track:'Stargazing', artist:'Travis Scott', matchType:'same-artist', lat:lat+spread*1.3, lng:lng+spread*0.2 },
    ];
  }

  let _usingMocks = false;

  async function loadRadar(lat, lng) {
    try {
      const r = await fetch(`/api/radar/nearby?lat=${lat}&lng=${lng}&radius=50`);
      const d = await r.json();
      if (r.ok && d.ok && d.users?.length) {
        _usingMocks = false;
        renderUsers(d.users); return;
      }
    } catch (_) {}
    // Показываем демо-пользователей если никого нет
    _usingMocks = true;
    renderUsers(getMocks(lat, lng).map(u => ({ ...u, isDemo: true })));
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

    if (!track && user.yandexToken) {
      try {
        const r = await fetch('/api/yandex/current-track');
        const d = await r.json();
        if (d.ok && d.isPlaying && d.track) track = d.track;
      } catch (_) {}
    }

    const pill    = document.getElementById('nowPill');
    const cover   = document.getElementById('npCover');
    const coverPh = document.getElementById('npCoverPh');
    const dot     = document.getElementById('npDot');
    const title   = document.getElementById('npTitle');
    const connect = document.getElementById('npConnect'); // legacy

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

  let _sheetUser = null;

  function openUserProfile() {
    if (_sheetUser && !_sheetUser.isDemo && _sheetUser.name) {
      window.location.href = `/u/${encodeURIComponent(_sheetUser.name)}`;
    }
  }
  window.openUserProfile = openUserProfile;

  function openSheet(u) {
    _sheetUser = u;
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

    // Если демо-пользователь — показываем заглушку
    if (u.isDemo) {
      const btn = document.getElementById('sheetSignalBtn');
      btn.textContent = '👻 Демо — слушай музыку';
      btn.className = 'sheet-btn secondary';
      btn.disabled = true;
      backdrop.classList.add('open');
      return;
    }

    // Кнопка профиля
    // Профиль — только после принятого сигнала
    const uid = u.id || u.userId;
    const canSeeProfile = uid && _acceptedSignalTo.has(String(uid));
    const profileBtn = document.getElementById('sheetProfileBtn');
    if (profileBtn) {
      if (canSeeProfile) {
        profileBtn.style.display = '';
        profileBtn.onclick = () => window.location.href = `/u/${encodeURIComponent(uid || u.name)}`;
      } else {
        profileBtn.style.display = 'none';
      }
    }

    // Фото грузим всегда (без перехода на профиль)
    const photosEl = document.getElementById('sheetPhotos');
    if (photosEl) {
      photosEl.style.display = 'none';
      photosEl.innerHTML = '';
      if (uid && !u.isDemo) {
        fetch(`/api/user/${encodeURIComponent(uid)}`)
          .then(r => r.json())
          .then(d => {
            if (!d.ok) return;
            const photos = d.user?.photos || [];
            if (!photos.length) return;
            photosEl.style.cssText = `display:grid;grid-template-columns:repeat(${Math.min(photos.length,3)},1fr);gap:4px;border-radius:12px;overflow:hidden;margin-bottom:12px;`;
            // Тап на фото — только если принят сигнал
            photosEl.innerHTML = photos.slice(0,3).map(src =>
              `<img src="${src}" style="width:100%;aspect-ratio:1;object-fit:cover;${canSeeProfile?'cursor:pointer;':''}" ${canSeeProfile ? `onclick="window.location.href='/u/${encodeURIComponent(uid)}'"` : ''} />`
            ).join('');
            if (d.user?.bio) {
              let bioEl = document.getElementById('sheetBio');
              if (!bioEl) {
                bioEl = document.createElement('div');
                bioEl.id = 'sheetBio';
                bioEl.style.cssText = 'font-size:13px;color:rgba(255,255,255,0.6);line-height:1.5;margin-bottom:12px;padding:0 2px;';
                photosEl.parentNode.insertBefore(bioEl, photosEl.nextSibling);
              }
              bioEl.textContent = d.user.bio;
            }
          }).catch(() => {});
      }
    }

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

  document.getElementById('sheetClose')?.addEventListener('click', closeSheet);
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

  // ── Manual track sheet ───────────────────────────────────
  let _selectedTrack = null;
  let _searchTimer   = null;

  // MediaSession — читаем что играет в браузере/системе
  function checkMediaSession() {
    const ms = navigator.mediaSession;
    if (!ms || !ms.metadata) return;
    const { title, artist, artwork } = ms.metadata;
    if (title && artist) {
      const img = artwork?.[0]?.src || '';
      document.getElementById('mediaSessionBtn').style.display = '';
      document.getElementById('mediaSessionBtn').dataset.track  = title;
      document.getElementById('mediaSessionBtn').dataset.artist = artist;
      document.getElementById('mediaSessionBtn').dataset.image  = img;
      // Обновляем текст кнопки
      const btn = document.getElementById('mediaSessionBtn').querySelector('button');
      if (btn) btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/></svg> ${title} — ${artist}`;
    }
  }

  window.detectFromMediaSession = function() {
    const btn = document.getElementById('mediaSessionBtn');
    if (!btn) return;
    selectTrack({
      name:   btn.dataset.track,
      artist: btn.dataset.artist,
      image:  btn.dataset.image,
      url:    '',
      album:  ''
    });
  };

  function selectTrack(t) {
    _selectedTrack = t;
    const el    = document.getElementById('selectedTrack');
    const cover = document.getElementById('selectedCover');
    const name  = document.getElementById('selectedName');
    const art   = document.getElementById('selectedArtist');
    const pub   = document.getElementById('manualPublishBtn');
    const res   = document.getElementById('searchResults');

    if (cover) { cover.src = t.image || ''; cover.style.display = t.image ? '' : 'none'; }
    if (name)    name.textContent   = t.name;
    if (art)     art.textContent    = t.artist;
    if (el) { el.style.display = 'flex'; }
    if (res)     res.innerHTML = '';
    if (pub) { pub.disabled = false; pub.style.opacity = '1'; }

    const inp = document.getElementById('smartSearchInput');
    if (inp) inp.value = '';
  }

  window.clearSelected = function() {
    _selectedTrack = null;
    const el  = document.getElementById('selectedTrack');
    const pub = document.getElementById('manualPublishBtn');
    if (el)  el.style.display = 'none';
    if (pub) { pub.disabled = true; pub.style.opacity = '0.4'; }
  };

  // Поиск: Deezer + iTunes + MusicBrainz + ручной ввод
  async function searchTracks(query) {
    if (query.length < 2) {
      document.getElementById('searchResults').innerHTML = '';
      return;
    }
    const spinner = document.getElementById('searchSpinner');
    if (spinner) spinner.style.display = '';

    const q = encodeURIComponent(query);

    const [deezerRes, itunesRes, mbRes] = await Promise.allSettled([
      // Deezer — лучше всего знает СНГ
      fetch(`https://api.deezer.com/search?q=${q}&limit=8&output=json`)
        .then(r => r.json()).then(d => (d.data || []).map(t => ({
          name: t.title, artist: t.artist.name,
          image: t.album?.cover_medium || '',
          album: t.album?.title || '', url: t.link || '',
          key: (t.title + t.artist.name).toLowerCase()
        }))).catch(() => []),

      // iTunes — широкая база
      fetch(`https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=8`)
        .then(r => r.json()).then(d => (d.results || []).map(t => ({
          name: t.trackName, artist: t.artistName,
          image: t.artworkUrl100 || t.artworkUrl60 || '',
          album: t.collectionName || '', url: t.trackViewUrl || '',
          key: (t.trackName + t.artistName).toLowerCase()
        }))).catch(() => []),

      // MusicBrainz — андерграунд и редкие треки
      fetch(`https://musicbrainz.org/ws/2/recording/?query=${q}&limit=6&fmt=json`, {
        headers: { 'User-Agent': 'aura-app/1.0 (aura-red.onrender.com)' }
      }).then(r => r.json()).then(d => (d.recordings || []).map(t => ({
        name: t.title,
        artist: t['artist-credit']?.[0]?.artist?.name || t['artist-credit']?.[0]?.name || '',
        image: '', album: t.releases?.[0]?.title || '', url: '',
        key: (t.title + (t['artist-credit']?.[0]?.artist?.name || '')).toLowerCase()
      })).filter(t => t.artist)).catch(() => []),
    ]);

    const deezer = deezerRes.value || [];
    const itunes = itunesRes.value || [];
    const mb     = mbRes.value     || [];

    // Объединяем без дублей, Deezer приоритетом
    const seen = new Set();
    const combined = [];
    for (const t of [...deezer, ...itunes, ...mb]) {
      if (!seen.has(t.key) && t.name && t.artist) {
        seen.add(t.key);
        combined.push(t);
      }
      if (combined.length >= 12) break;
    }

    if (spinner) spinner.style.display = 'none';
    renderSearchResults(combined, query);
  }

  function renderSearchResults(results, query) {
    const el = document.getElementById('searchResults');
    if (!el) return;
    window._searchData = results;

    const items = results.map((t, i) => `
      <div onclick="window._pickTrack(${i})" style="display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;transition:background 0.15s;border-bottom:1px solid rgba(255,255,255,0.04);" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background=''">
        ${t.image ? `<img src="${t.image}" style="width:42px;height:42px;border-radius:8px;object-fit:cover;flex-shrink:0;" />` : `<div style="width:42px;height:42px;border-radius:8px;background:rgba(255,255,255,0.08);flex-shrink:0;display:flex;align-items:center;justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`}
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.artist}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `).join('');

    // Кнопка ручного ввода всегда внизу
    const manualBtn = `
      <div onclick="window._enterManually()" style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;border-top:1px solid rgba(255,255,255,0.06);margin-top:2px;" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''">
        <div style="width:42px;height:42px;border-radius:8px;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.6);">Ввести вручную</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:1px;">Не нашёл нужный трек?</div>
        </div>
      </div>`;

    el.innerHTML = (results.length ? items : '<div style="padding:12px 14px;text-align:center;color:rgba(255,255,255,0.3);font-size:13px;">Ничего не найдено в базах</div>') + manualBtn;
  }

  // Ручной ввод — показываем два поля прямо в шторке
  window._enterManually = function() {
    const el = document.getElementById('searchResults');
    if (!el) return;
    el.innerHTML = `
      <div style="padding:12px 14px;display:flex;flex-direction:column;gap:8px;">
        <input id="manualTrackFallback" type="text" placeholder="Название трека" autocomplete="off"
          style="width:100%;padding:11px 13px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;font:700 14px/1 Inter,sans-serif;outline:none;" />
        <input id="manualArtistFallback" type="text" placeholder="Исполнитель" autocomplete="off"
          style="width:100%;padding:11px 13px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;font:700 14px/1 Inter,sans-serif;outline:none;" />
        <button onclick="window._confirmManual()" style="padding:11px;border-radius:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:#fff;font:700 13px/1 Inter,sans-serif;cursor:pointer;">
          Подтвердить
        </button>
      </div>`;
    document.getElementById('manualTrackFallback')?.focus();
  };

  window._confirmManual = function() {
    const name   = document.getElementById('manualTrackFallback')?.value.trim();
    const artist = document.getElementById('manualArtistFallback')?.value.trim();
    if (!name || !artist) return;
    selectTrack({ name, artist, image: '', album: '', url: '' });
  };

  window._pickTrack = function(i) {
    const t = window._searchData?.[i];
    if (t) selectTrack(t);
  };

  function openManualSheet() {
    const backdrop = document.getElementById('manualSheetBackdrop');
    backdrop.style.display = 'flex';
    window.clearSelected();
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('smartSearchInput').value = '';

    // Проверяем MediaSession
    checkMediaSession();

    // Если уже играет трек — подставляем
    if (_currentTrack?.name) {
      const inp = document.getElementById('smartSearchInput');
      if (inp) inp.value = _currentTrack.name + ' ' + (_currentTrack.artists || '');
    }

    setTimeout(() => {
      const inp = document.getElementById('smartSearchInput');
      inp?.focus();
      if (inp?.value) searchTracks(inp.value);
    }, 350);
  }

  window.closeManualSheet = function() {
    document.getElementById('manualSheetBackdrop').style.display = 'none';
  };

  // Дебаунс поиска при вводе
  document.getElementById('smartSearchInput')?.addEventListener('input', e => {
    const q = e.target.value.trim();
    clearTimeout(_searchTimer);
    if (!q) { document.getElementById('searchResults').innerHTML = ''; return; }
    _searchTimer = setTimeout(() => searchTracks(q), 350);
  });

  // Enter = поиск сразу
  document.getElementById('smartSearchInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearTimeout(_searchTimer);
      searchTracks(e.target.value.trim());
    }
  });

  // Тап на пилюлю или кнопку редактирования
  document.getElementById('nowPill').addEventListener('click', (e) => {
    if (e.target.closest('#npEditBtn')) openManualSheet();
  });
  document.getElementById('npEditBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    openManualSheet();
  });

  // Закрытие по backdrop
  document.getElementById('manualSheetBackdrop').addEventListener('click', (e) => {
    if (e.target === document.getElementById('manualSheetBackdrop')) window.closeManualSheet();
  });

  // Публикация
  document.getElementById('manualPublishBtn').addEventListener('click', async () => {
    if (!_selectedTrack) return;
    const btn = document.getElementById('manualPublishBtn');
    btn.disabled = true; btn.textContent = 'Публикуем...';

    const pos = await getGeo();
    try {
      const r = await fetch('/api/now-playing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track:  _selectedTrack.name,
          artist: _selectedTrack.artist,
          album:  _selectedTrack.album  || '',
          image:  _selectedTrack.image  || '',
          url:    _selectedTrack.url    || '',
          source: 'manual',
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
        })
      });
      const d = await r.json();
      if (d.ok) {
        _currentTrack = { name: _selectedTrack.name, artists: _selectedTrack.artist, image: _selectedTrack.image, source: 'manual' };
        const pill  = document.getElementById('nowPill');
        const dot   = document.getElementById('npDot');
        const title = document.getElementById('npTitle');
        const cover = document.getElementById('npCover');
        const ph    = document.getElementById('npCoverPh');
        pill.classList.add('has-track');
        dot.classList.remove('idle');
        if (_selectedTrack.image) {
          cover.src = _selectedTrack.image; cover.style.display = 'block';
          if (ph) ph.style.display = 'none';
        }
        title.textContent = `${_selectedTrack.name} · ${_selectedTrack.artist}`;
        pill.classList.add('beating');
        window.closeManualSheet();
        if (pos) loadRadar(pos.lat, pos.lng);
      } else {
        btn.textContent = d.error || 'Ошибка';
        setTimeout(() => { btn.textContent = 'Опубликовать 📡'; btn.disabled = false; }, 2000);
        return;
      }
    } catch { btn.textContent = 'Ошибка сети'; setTimeout(() => { btn.textContent = 'Опубликовать 📡'; }, 2000); }
    btn.disabled = false; btn.textContent = 'Опубликовать 📡';
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
      _acceptedSignalTo = new Set(
        sigs.filter(s => s.status === 'accepted').map(s => String(s.toId || s.to?.id))
      );
      // Входящие принятые сигналы (те кто принял наш — или мы приняли их)
      const ri = await fetch('/api/signals');
      const di = await ri.json();
      if (di.ok) {
        (di.signals || []).filter(s => s.status === 'accepted').forEach(s => {
          _acceptedSignalTo.add(String(s.fromId));
        });
      }
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
