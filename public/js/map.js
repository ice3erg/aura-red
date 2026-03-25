(function () {
  const DEFAULT_CENTER = [59.9343, 30.3351];
  const DEFAULT_ZOOM   = 13;

  // ── MAP ──────────────────────────────────────────────────────────────────
  const map = L.map('map', { zoomControl: true, attributionControl: false })
    .setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { maxZoom: 20, subdomains: 'abcd' }
  ).addTo(map);

  // ── YOU ──────────────────────────────────────────────────────────────────
  const youMarker = L.marker(DEFAULT_CENTER, {
    icon: makeIcon('you'),
    zIndexOffset: 1000,
  }).addTo(map);

  // ── MOCK USERS ───────────────────────────────────────────────────────────
  // Когда будет API — замени на fetch('/api/radar/users') и вызови renderUsers(data)
  const MOCK_USERS = [
    { id:1, name:'Алина, 22', city:'Санкт-Петербург', track:'Гостиница Космос', artist:'Mnogoznaal', cover:'', type:'same-track',  lat:59.9386, lng:30.3141 },
    { id:2, name:'Макс, 24',  city:'Санкт-Петербург', track:'Гостиница Космос', artist:'Mnogoznaal', cover:'', type:'same-track',  lat:59.9278, lng:30.3476 },
    { id:3, name:'Соня, 21',  city:'Санкт-Петербург', track:'Минус 40',         artist:'Mnogoznaal', cover:'', type:'same-artist', lat:59.9449, lng:30.3831 },
    { id:4, name:'Даня, 23',  city:'Санкт-Петербург', track:'Night Drive',      artist:'Phonk Archive', cover:'', type:'same-vibe', lat:59.9175, lng:30.3014 },
    { id:5, name:'Лера, 20',  city:'Санкт-Петербург', track:'Кислород',         artist:'Boulevard Depo', cover:'', type:'same-artist', lat:59.9542, lng:30.3334 },
    { id:6, name:'Артём, 25', city:'Санкт-Петербург', track:'САМОЛЁТ',          artist:'Guf',        cover:'', type:'same-vibe', lat:59.9200, lng:30.3650 },
  ];

  // ── RENDER ───────────────────────────────────────────────────────────────
  function renderUsers(users) {
    let t = 0, a = 0, v = 0;
    users.forEach(u => {
      if (u.type === 'same-track')  t++;
      if (u.type === 'same-artist') a++;
      if (u.type === 'same-vibe')   v++;

      const m = L.marker([u.lat, u.lng], { icon: makeIcon(u.type) }).addTo(map);
      m.on('click', e => { L.DomEvent.stopPropagation(e); openSheet(u); });
    });
    document.getElementById('cntTrack').textContent  = t;
    document.getElementById('cntArtist').textContent = a;
    document.getElementById('cntVibe').textContent   = v;
  }

  // ── ICON ─────────────────────────────────────────────────────────────────
  function makeIcon(type) {
    const s = { you:22, 'same-track':18, 'same-artist':15, 'same-vibe':12 }[type] || 15;
    return L.divIcon({
      className: '',
      html: `<div class="radar-marker ${type}"></div>`,
      iconSize: [s, s], iconAnchor: [s/2, s/2],
    });
  }

  // ── SHEET ─────────────────────────────────────────────────────────────────
  const backdrop = document.getElementById('sheetBackdrop');

  const BADGES = {
    'same-track':  '🔴 тот же трек',
    'same-artist': '⚪ тот же артист',
    'same-vibe':   '⚫ похожий вайб',
  };

  function openSheet(u) {
    document.getElementById('sheetName').textContent        = u.name;
    document.getElementById('sheetCity').textContent        = u.city || '';
    document.getElementById('sheetBadge').textContent       = BADGES[u.type] || '';
    document.getElementById('sheetBadge').className         = 'match-badge ' + u.type;
    document.getElementById('sheetTrackName').textContent   = u.track;
    document.getElementById('sheetTrackArtist').textContent = u.artist;
    const cover = document.getElementById('sheetCover');
    if (u.cover) { cover.src = u.cover; cover.style.display = ''; }
    else         { cover.style.display = 'none'; }
    backdrop.classList.add('open');
  }

  function closeSheet() { backdrop.classList.remove('open'); }

  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeSheet(); });
  map.on('click', closeSheet);

  // ── SPOTIFY TOPBAR ────────────────────────────────────────────────────────
  async function loadNowPlaying() {
    try {
      const res  = await fetch('/api/spotify/current-track');
      const data = await res.json();
      if (data?.track?.name) {
        document.getElementById('topbarTrack').textContent  = data.track.name;
        document.getElementById('topbarArtist').textContent = data.track.artists || '—';
      }
    } catch (e) { /* нет трека или не залогинен */ }
  }

  // ── GEOLOCATION ───────────────────────────────────────────────────────────
  function initGeo() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      map.setView([lat, lng], DEFAULT_ZOOM);
      youMarker.setLatLng([lat, lng]);
    });
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  loadNowPlaying();
  initGeo();
  renderUsers(MOCK_USERS);
})();
