// Стиль кольца по уровню ауры
function getAuraRingStyle(pts, isPlaying) {
  if (pts >= 600) return { border: '3px solid rgba(255,215,80,0.95)', shadow: '0 0 16px rgba(255,215,80,0.4)', anim: 'goldSpin 4s linear infinite' };
  if (pts >= 300) return { border: '2.5px solid rgba(255,43,43,0.95)', shadow: '0 0 14px rgba(255,43,43,0.45)', anim: isPlaying ? 'ringPulse 1.3s ease-in-out infinite' : 'none' };
  if (pts >= 150) return { border: '2px solid rgba(255,43,43,0.75)', shadow: '0 0 8px rgba(255,43,43,0.3)', anim: isPlaying ? 'ringPulse 1.6s ease-in-out infinite' : 'none' };
  if (pts >= 75)  return { border: '2px solid rgba(255,43,43,0.5)', shadow: '0 0 5px rgba(255,43,43,0.15)', anim: isPlaying ? 'ringPulse 2s ease-in-out infinite' : 'none' };
  if (pts >= 10)  return { border: '1.5px dashed rgba(255,255,255,0.3)', shadow: 'none', anim: 'none' };
  return { border: '1.5px solid rgba(255,255,255,0.1)', shadow: 'none', anim: 'none' };
}

// Цвет ауры по очкам
function getAuraColor(pts) {
  // Палитра +aura: белый → красный → ярко-красный → золотой
  if (pts >= 600) return { color: 'rgba(255,220,100,0.95)', glow: 'rgba(255,200,50,0.4)'  };
  if (pts >= 300) return { color: 'rgba(255,43,43,0.95)',   glow: 'rgba(255,43,43,0.5)'   };
  if (pts >= 150) return { color: 'rgba(255,70,43,0.85)',   glow: 'rgba(255,43,43,0.35)'  };
  if (pts >= 75)  return { color: 'rgba(255,43,43,0.7)',    glow: 'rgba(255,43,43,0.25)'  };
  if (pts >= 10)  return { color: 'rgba(255,255,255,0.55)', glow: 'rgba(255,255,255,0.1)' };
  return           { color: 'rgba(255,255,255,0.15)',        glow: 'transparent'           };
}

const U = window.AuraUtils;

"use strict";

// ── Aura ranks ─────────────────────────────────────────────
const RANKS = [
  { min:0,   name:"Новичок",   emoji:"🌱" },
  { min:10,  name:"Слушатель", emoji:"🎧" },
  { min:30,  name:"Меломан",   emoji:"🎵" },
  { min:75,  name:"Вибратор",  emoji:"📡" },
  { min:150, name:"Резонатор", emoji:"🌊" },
  { min:300, name:"Аурист",    emoji:"✦"  },
  { min:600, name:"Легенда",   emoji:"🔥" },
];
function getRank(pts) {
  for (let i = RANKS.length - 1; i >= 0; i--)
    if (pts >= RANKS[i].min) return { rank: RANKS[i], next: RANKS[i+1]||null, idx: i };
  return { rank: RANKS[0], next: RANKS[1], idx: 0 };
}
function renderAura(pts) {
  const { rank, next } = getRank(pts);
  const score = document.getElementById('auraScore');
  const rnk   = document.getElementById('auraRank');
  const fill  = document.getElementById('auraBarFill');
  const nxt   = document.getElementById('auraNext');
  if (score) score.textContent = pts;
  if (rnk)   rnk.textContent   = rank.emoji + ' ' + rank.name;
  if (next && fill) {
    const pct = Math.min(100, Math.round((pts - rank.min) / (next.min - rank.min) * 100));
    setTimeout(() => { fill.style.width = pct + '%'; }, 300);
    if (nxt) nxt.textContent = (next.min - pts) + ' до ' + next.name;
  } else {
    if (fill) fill.style.width = '100%';
    if (nxt)  nxt.textContent  = 'Максимальный ранг';
  }
}

// ── Collage ────────────────────────────────────────────────
function renderCollage(photos) {
  const grid = document.getElementById('collageGrid');
  if (!grid) return;
  const n = (photos || []).length;
  grid.className = 'collage-grid n' + Math.min(n, 6);
  grid.innerHTML = '';
  if (!n) {
    grid.innerHTML = `<div class="collage-empty" onclick="document.getElementById('photoInput').click()">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
      Добавить фото
    </div>`;
    return;
  }
  photos.slice(0, 6).forEach((src, i) => {
    const cell = document.createElement('div');
    cell.className = 'collage-cell' + (i === 0 && n === 3 ? ' span2' : '');
    cell.style.position = 'relative';
    cell.innerHTML = `
      <img src="${src}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" />
      <button onclick="removeCollagePhoto(${i})" style="position:absolute;top:5px;right:5px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.7);border:none;color:#fff;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:5;">✕</button>`;
    grid.appendChild(cell);
  });
}

// Удаление фото из коллажа
window.removeCollagePhoto = async function(idx) {
  const photos = (window._profileUser?.photos || []).filter((_, i) => i !== idx);
  const r = await fetch('/api/profile', {
    method:'PATCH', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ photos })
  }).then(r => r.json());
  if (r.ok && window._profileUser) {
    window._profileUser.photos = photos;
    renderCollage(photos);
  }
};

// ── Top artists & on repeat from track history ─────────────
function renderMusicStats(history) {
  if (!history?.length) return;

  // Считаем артистов
  const artistMap = {};
  const trackMap  = {};
  history.forEach(t => {
    if (t.artist) {
      if (!artistMap[t.artist]) artistMap[t.artist] = { name: t.artist, image: '', count: 0 };
      artistMap[t.artist].count++;
      if (t.image && !artistMap[t.artist].image) artistMap[t.artist].image = t.image;
    }
    const key = (t.track||'') + '::' + (t.artist||'');
    if (!trackMap[key]) trackMap[key] = { track: t.track, artist: t.artist, image: t.image||'', count: 0 };
    trackMap[key].count++;
  });

  const topArtists = Object.values(artistMap).sort((a,b) => b.count - a.count).slice(0, 6);
  const topTracks  = Object.values(trackMap).sort((a,b) => b.count - a.count).slice(0, 8);

  // Top artists
  if (topArtists.length >= 1) {
    const sec = document.getElementById('topArtistsSection');
    const row = document.getElementById('topArtistsRow');
    if (sec) sec.style.display = '';
    if (row) row.innerHTML = topArtists.map((a, i) => `
      <div class="artist-card">
        <div class="artist-img-wrap">
          ${a.image
            ? `<img src="${a.image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none'" />`
            : `<div style="width:100%;height:100%;border-radius:50%;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>`
          }
          <div class="artist-rank">${i+1}</div>
        </div>
        <div class="artist-name">${a.name}</div>
      </div>`).join('');
  }

  // On repeat
  if (topTracks.length >= 1) {
    const sec = document.getElementById('onRepeatSection');
    const row = document.getElementById('onRepeatRow');
    if (sec) sec.style.display = '';
    if (row) row.innerHTML = topTracks.slice(0,8).map(t => `
      <div class="repeat-card">
        <div class="repeat-cover">
          ${t.image
            ? `<img src="${t.image}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.nextSibling.style.display='flex'" /><div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`
          }
          <div class="repeat-count">${t.count} раз${t.count>1?'а':''}</div>
        </div>
        <div class="repeat-title">${t.track}</div>
        <div class="repeat-artist">${t.artist}</div>
      </div>`).join('');
  }

  // Статистика треков
  const tracksEl = document.getElementById('statTracks');
  if (tracksEl) tracksEl.textContent = history.length;
}

// ── Ticker ─────────────────────────────────────────────────
function renderTicker(history) {
  const section = document.getElementById('tickerSection');
  const track   = document.getElementById('tickerTrack');
  if (!section || !track || !history?.length) return;
  section.style.display = '';
  const items = history.slice(0, 20).map(t => `
    <div class="ticker-item">
      ${t.image ? `<img class="ticker-cover" src="${t.image}" onerror="this.style.display='none'" />` : ''}
      <span class="ticker-text">${t.track||'?'}</span>
      <span class="ticker-artist">${t.artist||''}</span>
      <span style="color:rgba(255,255,255,0.1);margin:0 8px;">·</span>
    </div>`).join('');
  track.innerHTML = items + items; // дублируем для бесшовного скролла
}

// ── Показ уведомлений ──────────────────────────────────────
function showNotice(msg, type = 'error') {
  const el = document.getElementById('profileNotice');
  if (!el) return;
  el.textContent = msg;
  el.className = 'notice visible ' + type;
  setTimeout(() => el.className = 'notice', 3500);
}

// ── MAIN ───────────────────────────────────────────────────
(async () => {
  try {
  const user = await U.requireAuth();
  if (!user) return;
  window._profileUser = user; // для removeCollagePhoto

  // Collage
  renderCollage(user.photos || []);

  // Avatar
  const img = document.getElementById('avatarImg');
  const ph  = document.getElementById('avatarPh');
  if (img && user.avatar) { img.src = user.avatar; img.className = 'avatar-img visible'; if (ph) ph.style.display = 'none'; }

  // Кольцо ауры — стиль по уровню
  const ring = document.getElementById('avatarRing');
  if (ring) {
    let isPlaying = false;
    try { const s = localStorage.getItem('aura_last_track'); isPlaying = !!(s && JSON.parse(s)?.name); } catch(_) {}
    const rs = getAuraRingStyle(user.auraPoints || 0, isPlaying);
    ring.style.border = rs.border;
    ring.style.boxShadow = rs.shadow;
    ring.style.animation = rs.anim;
    ring.style.opacity = '1';
    ring.style.inset = '-4px';
    ring.style.background = 'transparent';
    if (isPlaying) ring.classList.add('playing');
  }

  // Name + username
  const nameEl = document.getElementById('nameDisplay');
  if (nameEl) nameEl.textContent = user.name || '—';
  const userTag = document.getElementById('usernameTag');
  if (userTag) userTag.textContent = user.username ? '@' + user.username : '@' + (user.name||'').toLowerCase().replace(/\s+/g,'_');

  // Поля редактирования
  ['Name','Age','City','Bio'].forEach(f => {
    const el = document.getElementById('field'+f);
    if (el) {
      const val = user[f.toLowerCase()] || '';
      el.value = val;
      if (val) el.classList.add('has-value');
      el.addEventListener('input', () => el.classList.toggle('has-value', !!el.value));
    }
  });

  // Aura
  renderAura(user.auraPoints || 0);
  // Цвет aura-block динамический
  const _ac = getAuraColor(user.auraPoints || 0);
  const _ab = document.querySelector('.aura-block');
  if (_ab) {
    _ab.style.borderColor = _ac.color;
    _ab.style.boxShadow = `0 0 20px ${_ac.glow}`;
  }
  const _fill = document.getElementById('auraBarFill');
  if (_fill) _fill.style.background = `linear-gradient(90deg, ${_ac.color}, ${_ac.glow})`;

  // Stats
  const streakEl = document.getElementById('statStreak');
  if (streakEl) {
    const s = user.streakDays || 0;
    streakEl.textContent = s;
    if (s >= 7)  streakEl.style.color = '#ff8c00';
    if (s >= 30) streakEl.style.color = '#ff2b2b';
  }

  // Сигналы
  try {
    const r = await fetch('/api/signals').then(r => r.json());
    const acc = (r.signals||[]).filter(s => s.status==='accepted').length;
    const el  = document.getElementById('statSignals');
    if (el) el.textContent = acc;
  } catch(_) {}

  // Дни с регистрации
  if (user.createdAt) {
    const days = Math.floor((Date.now() - new Date(user.createdAt)) / 86400000);
    const el = document.getElementById('statDays');
    if (el) el.textContent = days;
  }

  // Music stats — сначала рендерим что есть, потом синкаем с Last.fm
  renderMusicStats(user.trackHistory || []);
  renderTicker(user.trackHistory || []);

  // Если Last.fm подключён — синкаем последние треки в фоне
  if (user.lastfmConnected && user.lastfmUsername) {
    fetch('/api/lastfm/sync', { method: 'POST' })
      .then(r => r.json())
      .then(async d => {
        if (d.ok && d.synced > 0) {
          // Перезагружаем данные и обновляем статистику
          const fresh = await fetch('/api/auth/me').then(r => r.json());
          if (fresh.ok && fresh.user) {
            user.trackHistory = fresh.user.trackHistory || [];
            window._profileUser = user;
            renderMusicStats(user.trackHistory);
            renderTicker(user.trackHistory);
            const tracksEl = document.getElementById('statTracks');
            if (tracksEl) tracksEl.textContent = user.trackHistory.length;
          }
        }
      })
      .catch(() => {});
  }

  // ── Weekly Challenges ───────────────────────────────────────
  try {
    const chR = await fetch('/api/challenges').then(r => r.json());
    if (chR.ok) {
      const list = document.getElementById('challengesList');
      const resetEl = document.getElementById('challengesReset');

      // Дней до сброса
      const now = new Date();
      const daysLeft = 7 - now.getDay() || 7;
      if (resetEl) resetEl.textContent = `сброс через ${daysLeft} дн.`;

      if (list) {
        list.innerHTML = chR.challenges.map(ch => {
          const done = ch.completed;
          const prog = ch.progress || { cur: 0, max: 1 };
          const pct  = Math.min(100, Math.round(prog.cur / prog.max * 100));
          return `
            <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:16px;background:${done ? 'rgba(255,43,43,0.08)' : 'rgba(255,255,255,0.04)'};border:1px solid ${done ? 'rgba(255,43,43,0.2)' : 'rgba(255,255,255,0.07)'};">
              <div style="width:42px;height:42px;border-radius:12px;background:${done ? 'rgba(255,43,43,0.15)' : 'rgba(255,255,255,0.06)'};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">${ch.emoji}</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
                  <div style="font-size:14px;font-weight:800;${done ? 'color:#ff8080;' : ''}">${ch.name}</div>
                  <div style="font-size:12px;font-weight:800;color:${done ? '#ff8080' : 'rgba(255,255,255,0.3)'};">+${ch.aura} ✦</div>
                </div>
                <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:6px;">${ch.desc}</div>
                <div style="height:3px;border-radius:99px;background:rgba(255,255,255,0.08);overflow:hidden;">
                  <div style="height:100%;width:${pct}%;border-radius:99px;background:${done ? 'linear-gradient(90deg,#ff2b2b,#ff8c00)' : 'rgba(255,255,255,0.2)'};transition:width 0.6s ease;"></div>
                </div>
                ${prog.max > 1 ? `<div style="font-size:10px;color:rgba(255,255,255,0.25);margin-top:3px;">${prog.cur} / ${prog.max}</div>` : ''}
              </div>
              ${done ? '<div style="font-size:20px;flex-shrink:0;">✅</div>' : ''}
            </div>`;
        }).join('');
      }

      // Начисляем ауру за выполненные (если ещё не начислено)
      // Сервер сам проверяет через checkAchievements
    }
  } catch(_) {}

  // ── Achievements ─────────────────────────────────────────
  try {
    const achR = await fetch('/api/achievements').then(r => r.json());
    if (achR.ok) {
      const earned  = achR.achievements.filter(a => a.earned);
      const locked  = achR.achievements.filter(a => !a.earned);
      const section = document.getElementById('achievementsSection');
      const grid    = document.getElementById('achievementsGrid');
      const lockedEl= document.getElementById('achievementsLocked');
      if (earned.length && section) section.style.display = '';

      // Заработанные — крупные иконки
      if (grid) grid.innerHTML = earned.map(a => `
        <div title="${a.name}: ${a.desc}" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:14px;background:rgba(255,43,43,0.08);border:1px solid rgba(255,43,43,0.15);cursor:default;">
          <div style="font-size:26px;line-height:1;">${a.emoji}</div>
          <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.6);text-align:center;line-height:1.2;">${a.name}</div>
        </div>`).join('');

      // Незаработанные — маленькие серые с замком
      if (lockedEl && locked.length) {
        lockedEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;">` +
          locked.map(a => `
            <div title="${a.name}: ${a.desc}" style="display:flex;align-items:center;gap:5px;padding:5px 9px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:15px;filter:grayscale(1);opacity:0.35;">${a.emoji}</span>
              <span style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.25);">${a.name}</span>
            </div>`).join('') + '</div>';
      }

      // Титул под именем
      if (achR.title) {
        const usernameRow = document.querySelector('.username-row');
        if (usernameRow && !document.getElementById('profileTitle')) {
          const titleEl = document.createElement('span');
          titleEl.id = 'profileTitle';
          titleEl.style.cssText = 'font-size:12px;font-weight:700;color:rgba(255,140,0,0.9);margin-left:4px;';
          titleEl.textContent = achR.title;
          usernameRow.appendChild(titleEl);
        }
      }
    }
  } catch(_) {}

  // Реакции на мои треки
  try {
    const rxR = await fetch('/api/reactions').then(r => r.json());
    const rxns = rxR.reactions || [];
    if (rxns.length) {
      const sec  = document.getElementById('reactionsSection');
      const list = document.getElementById('reactionsList');
      if (sec) sec.style.display = '';
      if (list) list.innerHTML = rxns.slice(0,5).map(r => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
          <div style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);overflow:hidden;flex-shrink:0;">
            ${r.fromAvatar ? `<img src="${r.fromAvatar}" style="width:100%;height:100%;object-fit:cover;" />` : ''}
          </div>
          <div style="flex:1;min-width:0;font-size:12px;color:rgba(255,255,255,0.6);">
            <b style="color:#fff">${r.fromName}</b> на <span style="color:rgba(255,255,255,0.8)">${r.track}</span>
          </div>
          <div style="font-size:22px;">${r.emoji}</div>
        </div>`).join('');
    }
  } catch(_) {}

  // ── Invite button ─────────────────────────────────────────
  document.getElementById('inviteBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('inviteModal');
    const code  = document.getElementById('inviteCodeDisplay');
    if (code) code.textContent = '@' + (user.username || user.name);
    modal?.classList.add('open');
  });
  document.getElementById('inviteModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  window.copyInviteCode = function() {
    const code = document.getElementById('inviteCodeDisplay')?.textContent || '';
    navigator.clipboard?.writeText(code.replace('@','')).then(() => {
      const btn = document.getElementById('inviteCopyBtn');
      if (btn) { btn.textContent = 'Скопировано!'; setTimeout(() => btn.textContent = 'Скопировать', 2000); }
    }).catch(() => {});
  };

  // ── Share button ──────────────────────────────────────────
  document.getElementById('shareBtn')?.addEventListener('click', () => {
    const url = location.origin + '/u/' + encodeURIComponent(user.username || user.name);
    if (navigator.share) {
      navigator.share({ title: '+aura', text: 'Смотри что я слушаю', url });
    } else {
      navigator.clipboard?.writeText(url);
      showNotice('Ссылка скопирована!', 'success');
    }
  });

  // ── Username modal ────────────────────────────────────────
  document.getElementById('usernameEditBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('usernameModal');
    const inp   = document.getElementById('usernameInput');
    if (inp) inp.value = user.username || '';
    modal?.classList.add('open');
    setTimeout(() => inp?.focus(), 300);
  });
  document.getElementById('usernameModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  let _usernameTimer = null;
  let _usernameValid = false;
  document.getElementById('usernameInput')?.addEventListener('input', e => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g,'');
    e.target.value = val;
    const avail = document.getElementById('usernameAvail');
    const btn   = document.getElementById('usernameSaveBtn');
    _usernameValid = false;
    if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }
    if (val.length < 3) { if (avail) { avail.textContent = ''; } return; }
    clearTimeout(_usernameTimer);
    if (avail) avail.textContent = '...';
    _usernameTimer = setTimeout(async () => {
      try {
        const resp = await fetch('/api/username/check', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ username: val })
        });
        if (!resp.ok) throw new Error('server error');
        const r = await resp.json();
        if (r.available) {
          if (avail) { avail.textContent = '✓'; avail.style.color = '#4ade80'; }
          _usernameValid = true;
          if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        } else {
          if (avail) { avail.textContent = '✗'; avail.style.color = '#f87171'; }
        }
      } catch(_) {
        // Сервер недоступен — разрешаем сохранить (проверка на бэке)
        if (avail) { avail.textContent = '✓'; avail.style.color = '#4ade80'; }
        _usernameValid = true;
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      }
    }, 500);
  });

  document.getElementById('usernameSaveBtn')?.addEventListener('click', async () => {
    const saveBtn2 = document.getElementById('usernameSaveBtn');
    if (!_usernameValid) return;
    const val = document.getElementById('usernameInput')?.value.trim();
    if (!val) return;
    try {
      const r = await fetch('/api/profile', {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ username: val })
      }).then(r => r.json());
      if (r.ok) {
        user.username = val;
        const tag = document.getElementById('usernameTag');
        if (tag) tag.textContent = '@' + val;
        document.getElementById('usernameModal')?.classList.remove('open');
        showNotice('@' + val + ' сохранён!', 'success');
      }
    } catch(_) {}
  });

  // ── Photo collage upload ──────────────────────────────────
  document.getElementById('photoInput')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const photos = [...(user.photos||[]), ev.target.result].slice(-6);
      const r = await fetch('/api/profile', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ photos })
      }).then(r => r.json());
      if (r.ok) { user.photos = photos; if (window._profileUser) window._profileUser.photos = photos; renderCollage(photos); }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  // ── Avatar upload ─────────────────────────────────────────
  document.getElementById('avatarInput')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const r = await fetch('/api/profile', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ avatar: ev.target.result })
      }).then(r => r.json());
      if (r.ok) {
        const imgEl = document.getElementById('avatarImg');
        const phEl  = document.getElementById('avatarPh');
        if (imgEl) { imgEl.src = ev.target.result; imgEl.className = 'avatar-img visible'; }
        if (phEl)  phEl.style.display = 'none';
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  // ── Music: Last.fm ────────────────────────────────────────
  const lastfmCard  = document.getElementById('lastfmCard');
  const lastfmStatus = document.getElementById('lastfmStatus');
  const lastfmBtn   = document.getElementById('lastfmBtn');
  const lastfmInput = document.getElementById('lastfmInputWrap');

  function renderLastfm(connected, username) {
    if (connected && username) {
      lastfmCard?.classList.add('connected');
      if (lastfmStatus) { lastfmStatus.textContent = '@'+username; lastfmStatus.classList.add('connected'); }
      if (lastfmBtn)    { lastfmBtn.textContent = 'Отключить'; lastfmBtn.className = 'music-action disconnect'; }
      if (lastfmInput)  lastfmInput.style.display = 'none';
    } else {
      lastfmCard?.classList.remove('connected');
      if (lastfmStatus) { lastfmStatus.textContent = 'Не подключено'; lastfmStatus.classList.remove('connected'); }
      if (lastfmBtn)    { lastfmBtn.textContent = 'Подключить'; lastfmBtn.className = 'music-action connect'; }
    }
  }
  renderLastfm(user.lastfmConnected, user.lastfmUsername);

  lastfmBtn?.addEventListener('click', async () => {
    if (user.lastfmConnected) {
      await fetch('/api/profile', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ lastfmConnected: false, lastfmUsername: '' }) });
      user.lastfmConnected = false; user.lastfmUsername = '';
      renderLastfm(false, '');
    } else {
      if (lastfmInput) lastfmInput.style.display = '';
      document.getElementById('lastfmUsernameField')?.focus();
    }
  });

  document.getElementById('lastfmSaveBtn')?.addEventListener('click', async () => {
    const un = document.getElementById('lastfmUsernameField')?.value.trim();
    if (!un) return;
    const btn = document.getElementById('lastfmSaveBtn');
    if (!btn) return;
    btn.disabled = true; btn.textContent = '...';
    try {
      const r = await fetch('/api/lastfm/current-track?username=' + encodeURIComponent(un)).then(r => r.json());
      if (r.ok !== false) {
        await fetch('/api/profile', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ lastfmConnected: true, lastfmUsername: un }) });
        user.lastfmConnected = true; user.lastfmUsername = un;
        renderLastfm(true, un);
      } else showNotice('Пользователь Last.fm не найден');
    } catch { showNotice('Ошибка сети'); }
    btn.disabled = false; btn.textContent = 'Сохранить';
  });

  // ── Music: Spotify ────────────────────────────────────────
  const spotifyCard   = document.getElementById('spotifyCard');
  const spotifyStatus = document.getElementById('spotifyStatus');
  const spotifyBtn    = document.getElementById('spotifyBtn');
  function renderSpotify(connected, name) {
    if (connected) {
      spotifyCard?.classList.add('connected');
      if (spotifyStatus) { spotifyStatus.textContent = name||'Подключено'; spotifyStatus.classList.add('connected'); }
      if (spotifyBtn)    { spotifyBtn.textContent = 'Отключить'; spotifyBtn.className = 'music-action disconnect'; }
    } else {
      spotifyCard?.classList.remove('connected');
      if (spotifyStatus) { spotifyStatus.textContent = 'Не подключено'; spotifyStatus.classList.remove('connected'); }
      if (spotifyBtn)    { spotifyBtn.textContent = 'Подключить'; spotifyBtn.className = 'music-action connect'; }
    }
  }
  renderSpotify(user.spotifyConnected, user.spotifyName);
  spotifyBtn?.addEventListener('click', () => {
    if (user.spotifyConnected) {
      fetch('/api/profile', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ spotifyConnected: false }) });
      user.spotifyConnected = false; renderSpotify(false, '');
    } else window.location.href = '/spotify/login';
  });

  // ── Save profile ──────────────────────────────────────────
  document.getElementById('saveBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('saveBtn');
    if (!btn) return;
    btn.disabled = true; btn.textContent = 'Сохраняем...';
    const name = (document.getElementById('fieldName')?.value || '').trim();
    const age  = document.getElementById('fieldAge')?.value || '';
    const city = (document.getElementById('fieldCity')?.value || '').trim();
    const bio  = (document.getElementById('fieldBio')?.value || '').trim();
    try {
      const r = await fetch('/api/profile', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name, age: age ? Number(age) : undefined, city, bio })
      }).then(r => r.json());
      if (r.ok) {
        const nd = document.getElementById('nameDisplay');
        if (nd && name) nd.textContent = name;
        showNotice('Сохранено!', 'success');
      } else showNotice(r.error || 'Ошибка');
    } catch(err) { console.error(err); showNotice('Ошибка сети'); }
    btn.disabled = false; btn.textContent = 'Сохранить профиль';
  });

  // ── Logout ────────────────────────────────────────────────
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('aura_last_track');
    window.location.href = '/login';
  });

  } catch(e) { console.error('[profile] init error:', e); }
})();

window.copyRefCode = function() {};

// Показ тоста о новом достижении
window.showAchievementToast = function(ach) {
  const toast   = document.getElementById('achToast');
  const emoji   = document.getElementById('achToastEmoji');
  const name    = document.getElementById('achToastName');
  if (!toast) return;
  if (emoji) emoji.textContent = ach.emoji || '🏆';
  if (name)  name.textContent  = ach.name  || 'Достижение';
  toast.style.display = 'flex';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
};
