// ── Недельные челленджи +aura ─────────────────────────────

// Пул челленджей — каждую неделю случайно выбираются 3
const CHALLENGE_POOL = [
  { id: 'streak_3',      emoji: '🔥', name: 'Не пропускай',      desc: 'Публикуй трек 3 дня подряд',      aura: 30,  check: (u,w) => (u.streakDays||0) >= 3 },
  { id: 'tracks_5',      emoji: '🎵', name: 'Активный слушатель', desc: 'Опубликуй 5 треков за неделю',    aura: 25,  check: (u,w) => w.tracksThisWeek >= 5 },
  { id: 'react_3',       emoji: '❤️', name: 'Реагируй',           desc: 'Отправь 3 реакции за неделю',     aura: 20,  check: (u,w) => w.reactionsGiven >= 3 },
  { id: 'signal_1',      emoji: '📡', name: 'Выйди на связь',     desc: 'Отправь сигнал кому-нибудь',      aura: 25,  check: (u,w) => w.signalsSent >= 1 },
  { id: 'new_artist',    emoji: '🎸', name: 'Новый вайб',         desc: 'Послушай 3 разных артиста',       aura: 20,  check: (u,w) => w.uniqueArtists >= 3 },
  { id: 'profile_full',  emoji: '✏️', name: 'Заполни профиль',    desc: 'Добавь фото и bio',                aura: 15,  check: (u,w) => !!u.avatar && (u.bio||'').length > 5 },
  { id: 'morning_track', emoji: '☀️', name: 'С добрым утром',     desc: 'Опубликуй трек до 10:00',         aura: 20,  check: (u,w) => w.morningTrack },
  { id: 'late_night',    emoji: '🌙', name: 'Ночной слушатель',   desc: 'Опубликуй трек после 23:00',      aura: 20,  check: (u,w) => w.lateNightTrack },
  { id: 'genres_2',      emoji: '🎭', name: 'Всеядный',           desc: 'Послушай 5+ треков за неделю',    aura: 15,  check: (u,w) => w.tracksThisWeek >= 5 },
  { id: 'react_back',    emoji: '🤝', name: 'Взаимность',         desc: 'Получи реакцию в ответ',          aura: 25,  check: (u,w) => w.reactionsReceived >= 1 },
];

// Получаем текущие челленджи недели (детерминированно по номеру недели)
function getWeeklyChallengeDefs() {
  const weekNum = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  // Псевдорандом на основе номера недели
  const seed = weekNum * 2654435761;
  const indices = [];
  let s = seed;
  while (indices.length < 3) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const idx = Math.abs(s) % CHALLENGE_POOL.length;
    if (!indices.includes(idx)) indices.push(idx);
  }
  return indices.map(i => CHALLENGE_POOL[i]);
}

module.exports = { CHALLENGE_POOL, getWeeklyChallengeDefs };
