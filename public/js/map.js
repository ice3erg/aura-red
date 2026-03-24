/**
 * +aura — map.js
 * 
 * Пока работает на мок-данных.
 * Когда будет реальный API — замени loadUsers() на fetch('/api/radar/users')
 * и передай массив в renderUsers(users).
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const DEFAULT_CENTER = [59.9343, 30.3351]; // Санкт-Петербург
const DEFAULT_ZOOM   = 13;

// ─── MAP INIT ─────────────────────────────────────────────────────────────────

const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
}).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

L.tileLayer(
  'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
  { maxZoom: 20 }
).addTo(map);

// Зум-контрол переносим вправо-снизу через CSS класс
L.control.zoom({ position: 'bottomright' }).addTo(map);

// ─── YOUR MARKER ─────────────────────────────────────────────────────────────

const youMarker = L.marker(DEFAULT_CENTER, {
  icon: makeIcon('you'),
  zIndexOffset: 1000,
}).addTo(map);

// ─── MOCK USERS ──────────────────────────────────────────────────────────────
// Замени этот массив на реальные данные из API когда будет бэкенд.
// Поля:
//   id        — уникальный идентификатор
//   name      — имя + возраст (строка)
//   city      — город (строка)
//   track     — название трека
//   artist    — исполнитель
//   cover     — URL обложки (опционально)
//   type      — 'same-track' | 'same-artist' | 'same-vibe'
//   lat, lng  — координаты

const MOCK_USERS = [
  {
    id: 1,
    name: 'Алина, 22',
    city: 'Санкт-Петербург',
    track: 'Гостиница Космос',
    artist: 'Mnogoznaal',
    cover: '',
    type: 'same-track',
    lat: 59.9386, lng: 30.3141,
  },
  {
    id: 2,
    name: 'Макс, 24',
    city: 'Санкт-Петербург',
    track: 'Гостиница Космос',
    artist: 'Mnogoznaal',
    cover: '',
    type: 'same-track',
    lat: 59.9278, lng: 30.3476,
  },
  {
    id: 3,
    name: 'Соня, 21',
    city: 'Санкт-Петербург',
    track: 'Минус 40',
    artist: 'Mnogoznaal',
    cover: '',
    type: 'same-artist',
    lat: 59.9449, lng: 30.3831,
  },
  {
    id: 4,
    name: 'Даня, 23',
    city: 'Санкт-Петербург',
    track: 'Night Drive',
    artist: 'Phonk Archive',
    cover: '',
    type: 'same-vibe',
    lat: 59.9175, lng: 30.3014,
  },
  {
    id: 5,
    name: 'Лера, 20',
    city: 'Санкт-Петербург',
    track: 'Кислород',
    artist: 'Boulevard Depo',
    cover: '',
    type: 'same-artist',
    lat: 59.9542, lng: 30.3334,
  },
  {
    id: 6,
    name: 'Артём, 25',
    city: 'Санкт-Петербург',
    track: 'САМОЛЁТ',
    artist: 'Guf',
    cover: '',
    type: 'same-vibe',
    lat: 59.9200, lng: 30.3650,
  },
];

// ─── RENDER USERS ─────────────────────────────────────────────────────────────

function renderUsers(users) {
  let countTrack = 0, countArtist = 0, countVibe = 0;

  users.forEach(user => {
    if (user.type === 'same-track')  countTrack++;
    if (user.type === 'same-artist') countArtist++;
    if (user.type === 'same-vibe')   countVibe++;

    const marker = L.marker([user.lat, user.lng], {
      icon: makeIcon(user.type),
    }).addTo(map);

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      openSheet(user);
    });
  });

  document.getElementById('countSameTrack').textContent  = countTrack;
  document.getElementById('countSameArtist').textContent = countArtist;
  document.getElementById('countSameVibe').textContent   = countVibe;
}

// ─── ICON FACTORY ────────────────────────────────────────────────────────────

function makeIcon(type) {
  const sizes = { you: 22, 'same-track': 18, 'same-artist': 16, 'same-vibe': 13 };
  const size   = sizes[type] || 16;
  const anchor = size / 2;
  return L.divIcon({
    className: '',
    html: `<div class="radar-marker ${type}"></div>`,
    iconSize:   [size, size],
    iconAnchor: [anchor, anchor],
  });
}

// ─── PROFILE SHEET ───────────────────────────────────────────────────────────

const backdrop    = document.getElementById('sheetBackdrop');
const sheetClose  = document.getElementById('sheetClose');
const sheetName   = document.getElementById('sheetName');
const sheetMeta   = document.getElementById('sheetMeta');
const sheetBadge  = document.getElementById('sheetBadge');
const sheetCover  = document.getElementById('sheetCover');
const sheetTrackName   = document.getElementById('sheetTrackName');
const sheetTrackArtist = document.getElementById('sheetTrackArtist');

const BADGE_LABELS = {
  'same-track':  '🔴 тот же трек',
  'same-artist': '⚪ тот же артист',
  'same-vibe':   '⚫ похожий вайб',
};

function openSheet(user) {
  sheetName.textContent  = user.name;
  sheetMeta.textContent  = user.city || '';
  sheetBadge.textContent = BADGE_LABELS[user.type] || '';
  sheetBadge.className   = `match-badge ${user.type}`;

  sheetTrackName.textContent   = user.track;
  sheetTrackArtist.textContent = user.artist;

  if (user.cover) {
    sheetCover.src   = user.cover;
    sheetCover.style.display = '';
  } else {
    sheetCover.style.display = 'none';
  }

  backdrop.classList.add('open');
}

function closeSheet() {
  backdrop.classList.remove('open');
}

sheetClose.addEventListener('click', closeSheet);
backdrop.addEventListener('click', (e) => {
  if (e.target === backdrop) closeSheet();
});
map.on('click', closeSheet);

// ─── SPOTIFY TOPBAR ──────────────────────────────────────────────────────────

async function loadNowPlaying() {
  try {
    // Берём токен из localStorage (хранится в объекте пользователя)
    const session = JSON.parse(localStorage.getItem('aura_session') || 'null');
    const users   = JSON.parse(localStorage.getItem('aura_users')   || '[]');
    const user    = users.find(u => u.id === session?.userId);
    const token   = user?.accessToken;

    if (!token) return;

    const res  = await fetch(`/api/spotify/current-track?accessToken=${encodeURIComponent(token)}`);
    const data = await res.json();

    if (data?.track?.name) {
      document.getElementById('topbarTrack').textContent  = data.track.name;
      document.getElementById('topbarArtist').textContent = data.track.artists || '—';
    }
  } catch (e) {
    // Не залогинен или нет трека — оставляем «—»
  }
}

// ─── GEOLOCATION ─────────────────────────────────────────────────────────────
// Если браузер разрешит — центрируем карту на реальной позиции юзера.

function initGeolocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      map.setView([lat, lng], DEFAULT_ZOOM);
      youMarker.setLatLng([lat, lng]);
    },
    () => { /* отказал — остаёмся на СПб */ }
  );
}

// ─── INIT ────────────────────────────────────────────────────────────────────

loadNowPlaying();
initGeolocation();
renderUsers(MOCK_USERS);

// Когда будет реальный API:
// async function loadUsers() {
//   const res   = await fetch('/api/radar/users');
//   const users = await res.json();
//   renderUsers(users);
// }
// loadUsers();
