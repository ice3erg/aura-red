// ── Система достижений +aura ─────────────────────────────
const ACHIEVEMENTS = [
  // Первые шаги
  { id: 'first_track',   emoji: '🎵', name: 'Первый трек',    desc: 'Опубликовал первый трек',          check: u => (u.trackHistory||[]).length >= 1,   aura: 10  },
  { id: 'first_signal',  emoji: '📡', name: 'На связи',       desc: 'Отправил первый сигнал',           check: u => false, aura: 15  }, // проверяется отдельно
  { id: 'first_chat',    emoji: '💬', name: 'Разговор',       desc: 'Первый принятый сигнал',           check: u => false, aura: 20  },

  // Музыкальная активность
  { id: 'tracks_10',     emoji: '🎧', name: 'Меломан',        desc: '10 треков в истории',              check: u => (u.trackHistory||[]).length >= 10,  aura: 20  },
  { id: 'tracks_50',     emoji: '🎼', name: 'Коллекционер',   desc: '50 треков в истории',              check: u => (u.trackHistory||[]).length >= 50,  aura: 50  },
  { id: 'tracks_100',    emoji: '⚡', name: 'Легенда плейлиста', desc: '100 треков в истории',          check: u => (u.trackHistory||[]).length >= 100, aura: 100 },

  // Стрики
  { id: 'streak_3',      emoji: '🔥', name: 'В огне',         desc: '3 дня подряд',                    check: u => (u.streakDays||0) >= 3,             aura: 15  },
  { id: 'streak_7',      emoji: '💫', name: 'На волне',       desc: '7 дней подряд',                   check: u => (u.streakDays||0) >= 7,             aura: 50  },
  { id: 'streak_30',     emoji: '💀', name: 'Одержимый',      desc: '30 дней подряд',                  check: u => (u.streakDays||0) >= 30,            aura: 200 },

  // Социальное
  { id: 'signals_5',     emoji: '🌍', name: 'Радарный',       desc: '5 принятых сигналов',             check: u => false, aura: 50  },
  { id: 'signals_10',    emoji: '🛸', name: 'Притяжение',     desc: '10 принятых сигналов',            check: u => false, aura: 100 },

  // Аура
  { id: 'aura_100',      emoji: '✨', name: 'Заряженный',     desc: '100 очков ауры',                  check: u => (u.auraPoints||0) >= 100,           aura: 0   },
  { id: 'aura_300',      emoji: '🌊', name: 'Резонатор',      desc: '300 очков ауры',                  check: u => (u.auraPoints||0) >= 300,           aura: 0   },
  { id: 'aura_600',      emoji: '👑', name: 'Легенда',        desc: '600 очков ауры',                  check: u => (u.auraPoints||0) >= 600,           aura: 0   },

  // Профиль
  { id: 'has_avatar',    emoji: '🖼️', name: 'Лицо',           desc: 'Загрузил аватар',                 check: u => !!u.avatar,                         aura: 5   },
  { id: 'has_bio',       emoji: '📝', name: 'История',        desc: 'Заполнил "о себе"',               check: u => (u.bio||'').length >= 10,           aura: 5   },
  { id: 'has_photos',    emoji: '📸', name: 'Фотограф',       desc: 'Добавил 3+ фото',                 check: u => (u.photos||[]).length >= 3,         aura: 10  },
  { id: 'has_username',  emoji: '🏷️', name: 'Свой стиль',     desc: 'Установил юзернейм',              check: u => !!u.username,                       aura: 10  },
];

// Титулы по уровню ауры (показываются под именем)
const TITLES = [
  { min: 0,   title: '',              },
  { min: 30,  title: '🎧 Меломан'     },
  { min: 75,  title: '📡 Вибратор'    },
  { min: 150, title: '🌊 Резонатор'   },
  { min: 300, title: '✦ Аурист'       },
  { min: 600, title: '👑 Легенда'     },
];

function getTitle(auraPoints) {
  for (let i = TITLES.length - 1; i >= 0; i--) {
    if (auraPoints >= TITLES[i].min) return TITLES[i].title;
  }
  return '';
}

// Проверяем какие достижения нужно выдать
function checkAchievements(user) {
  const current = new Set((user.achievements || []).map(a => a.id));
  const newOnes = [];
  for (const ach of ACHIEVEMENTS) {
    if (!current.has(ach.id) && ach.check(user)) {
      newOnes.push({ id: ach.id, ts: Date.now() });
    }
  }
  return newOnes;
}

module.exports = { ACHIEVEMENTS, TITLES, getTitle, checkAchievements };
