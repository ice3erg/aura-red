// Стиль кольца по очкам ауры
function getAuraRing(pts, isPlaying) {
  if (pts >= 600) return {
    border: '3px solid rgba(255,215,80,0.95)',
    shadow: '0 0 0 2px rgba(255,215,80,0.15),0 0 16px rgba(255,215,80,0.5)',
    anim:   'goldSpin 3s linear infinite',
  };
  if (pts >= 300) return {
    border: '2.5px solid rgba(255,43,43,0.95)',
    shadow: '0 0 0 1px rgba(255,43,43,0.1),0 0 14px rgba(255,43,43,0.5)',
    anim:   isPlaying ? 'youPulse 1.3s ease-in-out infinite' : 'ringBreath 3s ease-in-out infinite',
  };
  if (pts >= 150) return {
    border: '2px solid rgba(255,43,43,0.75)',
    shadow: '0 0 8px rgba(255,43,43,0.3)',
    anim:   isPlaying ? 'youPulse 1.6s ease-in-out infinite' : 'ringBreath 4s ease-in-out infinite',
  };
  if (pts >= 75) return {
    border: '2px solid rgba(255,43,43,0.5)',
    shadow: '0 0 5px rgba(255,43,43,0.15)',
    anim:   isPlaying ? 'youPulse 2s ease-in-out infinite' : 'none',
  };
  if (pts >= 10) return {
    border: '2px dashed rgba(255,255,255,0.4)',
    shadow: 'none',
    anim:   'dashSpin 8s linear infinite',
  };
  return { border: '1px solid rgba(255,255,255,0.08)', shadow: 'none', anim: 'none' };
}

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
  let _zoneMarkers = [];
  let _zoneCreatePos = null;
  let _selectedZoneEmoji = '🔥';
  let _myZoneId = null;
  let _longPressTimer = null;

  // ── Geo ──────────────────────────────────────────────────
  // Показываем город в стиле Zenly
  async function updateCityDisplay(lat, lng) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ru`,
        { headers: { 'User-Agent': 'AuraApp/1.0' } }
      ).then(r => r.json());

      const addr = r.address || {};
      const city     = addr.city || addr.town || addr.village || addr.county || '';
      const district = addr.city_district || addr.suburb || addr.neighbourhood || addr.road || '';

      const cityEl     = document.getElementById('cityName');
      const districtEl = document.getElementById('districtName');
      const wrap       = document.getElementById('cityChip');

      if (cityEl && city) cityEl.textContent = city;
      if (districtEl)     districtEl.textContent = district;
      if (wrap && city)   wrap.style.display = 'block';
    } catch(_) {}
  }

  function getGeo() {
    return new Promise(res => {
      // Мгновенно возвращаем кэш из localStorage (< 10 мин)
      try {
        const saved = localStorage.getItem('aura_last_pos');
        if (saved) {
          const p = JSON.parse(saved);
          if (p && Date.now() - p.ts < 10 * 60 * 1000) {
            _lastPos = p;
            res(p); // мгновенный ответ!
            // Обновляем в фоне
            navigator.geolocation?.getCurrentPosition(pos => {
              const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
              _lastPos = fresh;
              localStorage.setItem('aura_last_pos', JSON.stringify(fresh));
              // Тихо обновляем маркер и радар если позиция сильно изменилась
              const dist = Math.abs(fresh.lat - p.lat) + Math.abs(fresh.lng - p.lng);
              if (dist > 0.001) {
                _youMarker?.setLatLng([fresh.lat, fresh.lng]);
                loadRadar(fresh.lat, fresh.lng);
                updateCityDisplay(fresh.lat, fresh.lng);
              }
            }, () => {}, { timeout: 8000, maximumAge: 30000, enableHighAccuracy: false });
            return;
          }
        }
      } catch(_) {}

      if (!navigator.geolocation) { res(null); return; }
      if (_lastPos && Date.now() - _lastPos.ts < 120000) { res(_lastPos); return; }
      navigator.geolocation.getCurrentPosition(
        p => {
          _lastPos = { lat: p.coords.latitude, lng: p.coords.longitude, ts: Date.now() };
          try { localStorage.setItem('aura_last_pos', JSON.stringify(_lastPos)); } catch(_) {}
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
    const isPlaying = !!_currentTrack?.name;
    const yap = user?.auraPoints||0;
    const yrl = yap>=600?5:yap>=300?4:yap>=150?3:yap>=75?2:yap>=10?1:0;
    const inner = user?.avatar
      ? `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : `<div class="ava-init" style="font-size:18px;">${(user?.name || 'Я')[0].toUpperCase()}</div>`;
    return L.divIcon({
      className: '',
      html: `<div style="position:relative;width:${size}px;height:${size}px;">
               <div class="ar ar-${yrl}${isPlaying?' ar-playing':''}"></div>
               <div class="you-marker" style="width:${size}px;height:${size}px;">
                 ${inner}
               </div>
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

    // Кольцо: друг=зелёный, same-genre=фиолетовый, иначе цвет ауры
    const ap_ = u.auraPoints||0;
    const rl_ = ap_>=600?5:ap_>=300?4:ap_>=150?3:ap_>=75?2:ap_>=10?1:0;
    const auraRing = u.isFriend
      ? `<div class="ar" style="position:absolute;inset:-3px;border-radius:50%;border:2.5px solid #22c55e;box-shadow:0 0 10px rgba(34,197,94,0.5);pointer-events:none;z-index:0;"></div>`
      : mt === 'same-genre'
      ? `<div class="ar" style="position:absolute;inset:-3px;border-radius:50%;border:2.5px solid #a855f7;box-shadow:0 0 8px rgba(168,85,247,0.5);pointer-events:none;z-index:0;"></div>`
      : `<div class="ar ar-${rl_}"></div>`;

    // Время активности
    const ago = u.updatedAt
      ? (Date.now() - u.updatedAt < 60000 ? 'сейчас'
        : Date.now() - u.updatedAt < 3600000 ? Math.floor((Date.now()-u.updatedAt)/60000)+'м'
        : Math.floor((Date.now()-u.updatedAt)/3600000)+'ч')
      : '';

    // Метка под маркером — имя (только для друзей и same-track)
    const nameLabel = (u.isFriend || mt === 'same-track')
      ? `<div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:10px;font-weight:700;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.8);pointer-events:none;">${(u.name||'').split(' ')[0]}${ago?' · '+ago:''}</div>`
      : '';

    const totalH = size + (nameLabel ? 20 : 0);

    return L.divIcon({
      className: '',
      html: `<div style="position:relative;width:${size}px;height:${totalH}px;">
               <div class="ava-marker ${mt}" style="width:${size}px;height:${size}px;position:relative;opacity:${opacity};">
                 ${auraRing}
                 <div class="ava-pulse"></div>
                 ${inner}
                 ${sentBadge}
                 ${bubble}
               </div>
               ${nameLabel}
             </div>`,
      iconSize: [size, totalH], iconAnchor: [size/2, size/2],
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

      // pushNowPlaying с обработкой бонусов
      fetch('/api/now-playing', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          track: track.name||'', artist: track.artists||'',
          album: track.album||'', image: track.image||'',
          url: track.url||'', source: track.source||'lastfm',
          lat: null, lng: null,
        })
      }).then(r=>r.json()).then(d => {
        if (d.streakBonus > 0) {
          showMapToast(`🔥 Стрик-бонус +${d.streakBonus} ауры!`);
        }
        if (d.newAchievements?.length) {
          d.newAchievements.forEach((a, i) => {
            setTimeout(() => showMapToast(`${a.emoji||'🏆'} Достижение: ${a.name}`), i * 2500);
          });
        }
      }).catch(()=>{});

      // Обновляем радар с новым треком
      const pos = await getGeo();
      if (pos) { loadRadar(pos.lat, pos.lng); updateCityDisplay(pos.lat, pos.lng); loadZones(); }

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
    // Время активности в шторке
    const sheetCityEl = document.getElementById('sheetCity');
    if (sheetCityEl) {
      const agoMs = u.updatedAt ? Date.now() - u.updatedAt : null;
      const agoStr = !agoMs ? '' :
        agoMs < 60000   ? '🟢 онлайн' :
        agoMs < 3600000 ? `${Math.floor(agoMs/60000)} мин назад` :
        agoMs < 86400000? `${Math.floor(agoMs/3600000)} ч назад` : 'давно';
      sheetCityEl.textContent = [u.city ? `📍 ${u.city}` : '', agoStr].filter(Boolean).join('  ');
    }
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

    // Реакции — показываем если у пользователя есть трек
    const reactEl = document.getElementById('sheetReactions');
    if (reactEl) reactEl.style.display = (u.track && !u.isDemo) ? '' : 'none';
    window._reactionTarget = { toId: uid, track: u.track, artist: u.artist };

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

  // ── Long press для создания зоны ───────────────────────
  map.on('mousedown touchstart', function(e) {
    _longPressTimer = setTimeout(() => {
      const latlng = e.latlng || map.mouseEventToLatLng(e.originalEvent);
      if (!latlng) return;
      _zoneCreatePos = latlng;
      // Ripple в точке
      const pt = map.latLngToContainerPoint(latlng);
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;left:${pt.x}px;top:${pt.y}px;width:0;height:0;border-radius:50%;border:2px solid rgba(255,43,43,0.8);transform:translate(-50%,-50%);pointer-events:none;z-index:400;animation:mapRipple 0.5s ease-out forwards;`;
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 550);
      // Открываем шторку создания
      setTimeout(() => {
        const bd = document.getElementById('zoneCreateBackdrop');
        if (bd) { bd.style.display = 'flex'; document.getElementById('zoneNameInput').focus(); }
      }, 200);
      navigator.vibrate?.([30, 20, 60]);
    }, 600);
  });
  map.on('mouseup touchend touchcancel', () => clearTimeout(_longPressTimer));
  map.on('drag', () => clearTimeout(_longPressTimer));

  // Ripple эффект при клике на карту
  map.on('click', function(e) {
    const pt = map.latLngToContainerPoint(e.latlng);
    const ripple = document.createElement('div');
    ripple.style.cssText = `position:fixed;left:${pt.x}px;top:${pt.y}px;width:0;height:0;border-radius:50%;border:2px solid rgba(255,43,43,0.5);transform:translate(-50%,-50%);pointer-events:none;z-index:400;animation:mapRipple 0.7s ease-out forwards;`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 750);
  });

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

    const [lastfmRes, deezerRes, itunesRes] = await Promise.allSettled([
      // Last.fm — знает ВСЮ русскую музыку включая андерграунд
      fetch(`/api/lastfm/search?q=${q}`)
        .then(r => r.json()).then(d => (d.tracks || []).map(t => ({
          name: t.name, artist: t.artist, image: t.image || '',
          album: '', url: t.url || '',
          key: (t.name + t.artist).toLowerCase()
        }))).catch(() => []),

      // Deezer — обложки для СНГ треков
      fetch(`https://api.deezer.com/search?q=${q}&limit=8&output=json`)
        .then(r => r.json()).then(d => (d.data || []).map(t => ({
          name: t.title, artist: t.artist.name,
          image: t.album?.cover_medium || '',
          album: t.album?.title || '', url: t.link || '',
          key: (t.title + t.artist.name).toLowerCase()
        }))).catch(() => []),

      // iTunes — западная музыка
      fetch(`https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=6`)
        .then(r => r.json()).then(d => (d.results || []).map(t => ({
          name: t.trackName, artist: t.artistName,
          image: t.artworkUrl100 || t.artworkUrl60 || '',
          album: t.collectionName || '', url: t.trackViewUrl || '',
          key: (t.trackName + t.artistName).toLowerCase()
        }))).catch(() => []),
    ]);

    const lastfm = lastfmRes.value || [];
    const deezer = deezerRes.value || [];
    const itunes = itunesRes.value || [];

    // Строим карту обложек из Deezer и iTunes по ключу
    const coverMap = {};
    for (const t of [...deezer, ...itunes]) {
      if (t.image) coverMap[t.key] = t.image;
    }

    // Last.fm первым — знает всё, добиваем обложками из Deezer/iTunes
    const seen = new Set();
    const combined = [];
    for (const t of [...lastfm, ...deezer, ...itunes]) {
      if (!seen.has(t.key) && t.name && t.artist) {
        seen.add(t.key);
        if (!t.image && coverMap[t.key]) t.image = coverMap[t.key];
        combined.push(t);
      }
      if (combined.length >= 12) break;
    }

    // Для треков без обложки — пробуем получить через Last.fm track.getInfo (батч)
    const nocover = combined.filter(t => !t.image).slice(0, 4);
    if (nocover.length) {
      await Promise.allSettled(nocover.map(t =>
        fetch(`/api/lastfm/cover?track=${encodeURIComponent(t.name)}&artist=${encodeURIComponent(t.artist)}`)
          .then(r => r.json())
          .then(d => { if (d.image) t.image = d.image; })
          .catch(() => {})
      ));
    }

    if (spinner) spinner.style.display = 'none';
    renderSearchResults(combined, query);
  }

  function renderSearchResults(results, query) {
    const el = document.getElementById('searchResults');
    if (!el) return;
    window._searchData = results;
    if (!results.length) {
      el.innerHTML = `<div style="padding:12px;text-align:center;color:rgba(255,255,255,0.3);font-size:13px;">Ничего не найдено</div>${manualBtnHTML()}`;
      return;
    }

    // Топ-1 — крупная карточка
    const top = results[0];
    const topCard = `
      <div onclick="window._pickTrack(0)" style="display:flex;align-items:center;gap:14px;padding:12px 14px;cursor:pointer;background:rgba(255,43,43,0.06);border-bottom:1px solid rgba(255,255,255,0.06);" onmouseover="this.style.background='rgba(255,43,43,0.1)'" onmouseout="this.style.background='rgba(255,43,43,0.06)'">
        <div style="position:relative;flex-shrink:0;">
          ${top.image
            ? `<img src="${top.image}" style="width:52px;height:52px;border-radius:10px;object-fit:cover;display:block;" onerror="this.style.display='none';this.nextSibling.style.display='flex'" /><div style="display:none;width:52px;height:52px;border-radius:10px;background:rgba(255,255,255,0.08);align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`
            : `<div style="width:52px;height:52px;border-radius:10px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`
          }
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${top.name}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:3px;">${top.artist}</div>
        </div>
        <div style="flex-shrink:0;padding:7px 14px;border-radius:99px;background:rgba(255,43,43,0.2);border:1px solid rgba(255,43,43,0.3);color:#ff6b6b;font:700 12px/1 Inter,sans-serif;">
          Выбрать
        </div>
      </div>`;

    // Остальные — компактный список
    const rest = results.slice(1, 6).map((t, i) => `
      <div onclick="window._pickTrack(${i+1})" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04);" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''">
        ${t.image
          ? `<img src="${t.image}" style="width:36px;height:36px;border-radius:7px;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'" />`
          : `<div style="width:36px;height:36px;border-radius:7px;background:rgba(255,255,255,0.07);flex-shrink:0;"></div>`
        }
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:1px;">${t.artist}</div>
        </div>
      </div>`).join('');

    el.innerHTML = topCard + rest + manualBtnHTML();
  }

  function manualBtnHTML() {
    return `<div onclick="window._enterManually()" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''">
      <div style="width:36px;height:36px;border-radius:7px;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
      </div>
      <div style="flex:1;">
        <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.5);">Нет нужного? Ввести вручную</div>
      </div>
    </div>`;
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
        try { localStorage.setItem('aura_last_track', JSON.stringify(_currentTrack)); } catch(_) {}
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
  // ── Reactions ────────────────────────────────────────────
  // ── Zone functions ───────────────────────────────────────
  window.selectZoneEmoji = function(btn) {
    document.querySelectorAll('.zone-emoji-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _selectedZoneEmoji = btn.dataset.emoji;
  };

  window.closeZoneCreate = function() {
    const bd = document.getElementById('zoneCreateBackdrop');
    if (bd) bd.style.display = 'none';
    _zoneCreatePos = null;
  };

  window.createZone = async function() {
    const name = document.getElementById('zoneNameInput')?.value.trim();
    if (!name) { document.getElementById('zoneNameInput')?.focus(); return; }
    const genre = document.getElementById('zoneGenreInput')?.value.trim() || '';
    const radius = parseInt(document.getElementById('zoneRadiusSlider')?.value) || 300;
    const pos = _zoneCreatePos || _lastPos;
    if (!pos) return;

    try {
      const r = await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, emoji: _selectedZoneEmoji, genre, radius_m: radius,
          lat: pos.lat, lng: pos.lng,
          track: _currentTrack?.name || '', artist: _currentTrack?.artists || ''
        })
      }).then(r => r.json());

      if (r.ok) {
        _myZoneId = r.id;
        window.closeZoneCreate();
        document.getElementById('zoneNameInput').value = '';
        document.getElementById('zoneGenreInput').value = '';
        showMapToast(`${_selectedZoneEmoji} Тусовка создана на 4 часа!`);
        loadZones(); // перерисовываем
      }
    } catch(e) { console.error('[createZone]', e); }
  };

  async function loadZones() {
    const pos = _lastPos;
    if (!pos) return;
    try {
      const r = await fetch(`/api/zones?lat=${pos.lat}&lng=${pos.lng}`).then(r => r.json());
      if (!r.ok) return;

      // Убираем старые
      _zoneMarkers.forEach(m => {
        if (m.circle) map.removeLayer(m.circle);
        if (m.marker) map.removeLayer(m.marker);
      });
      _zoneMarkers = [];

      r.zones.forEach(zone => {
        // Круг зоны
        const color = zone.emoji === '🔥' ? '#ff4500' :
                      zone.emoji === '🎵' ? '#8b5cf6' :
                      zone.emoji === '🌊' ? '#06b6d4' :
                      zone.emoji === '🎉' ? '#f59e0b' : '#ff2b2b';

        const circle = L.circle([zone.lat, zone.lng], {
          radius: zone.radius,
          color: color,
          fillColor: color,
          fillOpacity: 0.06,
          weight: 1.5,
          opacity: 0.4,
          dashArray: '6 4',
        }).addTo(map);

        // Иконка-метка зоны
        const timeLeft = Math.max(0, Math.round((zone.expiresAt - Date.now()) / 3600000 * 10) / 10);
        const label = L.divIcon({
          className: '',
          html: `<div class="zone-label" onclick="event.stopPropagation()">
                   <div style="font-size:18px;line-height:1;">${zone.emoji}</div>
                   <div style="font-size:11px;font-weight:700;margin-top:2px;">${zone.name}</div>
                   <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:1px;">⏱ ${timeLeft}ч</div>
                 </div>`,
          iconSize: [80, 60], iconAnchor: [40, 60],
        });
        const marker = L.marker([zone.lat, zone.lng], { icon: label, zIndexOffset: 500 }).addTo(map);
        marker.on('click', e => {
          L.DomEvent.stopPropagation(e);
          showMapToast(`${zone.emoji} ${zone.name} · ${zone.creatorName}${zone.genre ? ' · ' + zone.genre : ''}`);
          // Если это моя зона — предлагаем удалить
          if (zone.id === _myZoneId || (_user && zone.creatorName === _user.name)) {
            setTimeout(() => {
              if (confirm(`Удалить тусовку "${zone.name}"?`)) {
                fetch('/api/zones/' + zone.id, { method: 'DELETE' }).then(() => { _myZoneId = null; loadZones(); });
              }
            }, 300);
          }
        });

        _zoneMarkers.push({ circle, marker });
      });
    } catch(e) { console.error('[loadZones]', e); }
  }

  window.sendReaction = async function(emoji) {
    const t = window._reactionTarget;
    if (!t?.toId) return;
    const btns = document.querySelectorAll('#sheetReactions button');
    btns.forEach(b => b.disabled = true);
    try {
      const r = await fetch('/api/reactions', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ toId: t.toId, track: t.track||'', artist: t.artist||'', emoji })
      });
      const d = await r.json();
      if (d.ok) {
        const btn = [...btns].find(b => b.textContent.trim() === emoji);
        if (btn) {
          const orig = btn.style.background;
          btn.style.background = 'rgba(255,43,43,0.25)';
          btn.style.transform = 'scale(1.3)';
          setTimeout(() => { btn.style.background = orig; btn.style.transform = ''; }, 400);
        }
      }
    } catch(_) {}
    setTimeout(() => btns.forEach(b => b.disabled = false), 500);
  };

  async function init() {
    // Мгновенно центрируем карту из кэша геолокации
    try {
      const savedPos = localStorage.getItem('aura_last_pos');
      if (savedPos) {
        const p = JSON.parse(savedPos);
        if (p && Date.now() - p.ts < 30 * 60 * 1000) {
          map.setView([p.lat, p.lng], 14, { animate: false });
          updateCityDisplay(p.lat, p.lng);
        }
      }
    } catch(_) {}

    _user = await U.requireAuth();
    if (!_user) return;

    // Восстанавливаем последний трек из localStorage
    try {
      const saved = localStorage.getItem('aura_last_track');
      if (saved) {
        const t = JSON.parse(saved);
        if (t?.name) {
          _currentTrack = t;
          const pill  = document.getElementById('nowPill');
          const dot   = document.getElementById('npDot');
          const title = document.getElementById('npTitle');
          const cover = document.getElementById('npCover');
          const ph    = document.getElementById('npCoverPh');
          if (pill)  pill.classList.add('has-track');
          if (dot)   dot.classList.remove('idle');
          if (title) title.textContent = `${t.name} · ${t.artists}`;
          if (t.image && cover) { cover.src = t.image; cover.style.display = 'block'; if (ph) ph.style.display = 'none'; }
          if (pill)  pill.classList.add('beating');
        }
      }
    } catch(_) {}

    // You marker
    // Убираем skeleton — карта и юзер загружены
    const skeleton = document.getElementById('appSkeleton');
    const overlay  = document.getElementById('mapOverlay');
    if (skeleton) { skeleton.style.opacity = '0'; setTimeout(() => skeleton.remove(), 400); }
    if (overlay)  { overlay.style.opacity  = '0'; setTimeout(() => overlay.remove(),  600); }

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
