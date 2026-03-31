"use strict";

const RANKS = [
  { min:0,   name:"Новичок",   emoji:"🌱", color:"rgba(255,255,255,0.2)" },
  { min:10,  name:"Слушатель", emoji:"🎧", color:"#60a5fa" },
  { min:30,  name:"Меломан",   emoji:"🎵", color:"#c084fc" },
  { min:75,  name:"Вибратор",  emoji:"📡", color:"#ff8c00" },
  { min:150, name:"Резонатор", emoji:"🌊", color:"#ff6b35" },
  { min:300, name:"Аурист",    emoji:"✦",  color:"#ff2b2b" },
  { min:600, name:"Легенда",   emoji:"👑", color:"#ffd700" },
];

function getRank(pts) {
  for (let i = RANKS.length-1; i >= 0; i--)
    if (pts >= RANKS[i].min) return { rank: RANKS[i], next: RANKS[i+1]||null };
  return { rank: RANKS[0], next: RANKS[1] };
}

(async () => {
  const user = await window.AuraUtils.requireAuth();
  if (!user) return;

  // Загружаем ачивки (они возвращают актуальный auraPoints)
  const [achR, chR] = await Promise.all([
    fetch('/api/achievements').then(r=>r.json()).catch(()=>({ok:false})),
    fetch('/api/challenges').then(r=>r.json()).catch(()=>({ok:false})),
  ]);

  const pts = achR.auraPoints ?? user.auraPoints ?? 0;
  const { rank, next } = getRank(pts);

  // Subtitle
  const sub = document.getElementById('pageSubtitle');
  if (sub) sub.textContent = achR.title || rank.name;

  // Hero
  document.getElementById('auraPts').textContent       = pts;
  document.getElementById('auraRankName').textContent  = rank.emoji + ' ' + rank.name;
  document.getElementById('auraOrbEmoji').textContent  = rank.emoji;

  const orb = document.getElementById('auraOrb');
  const ring = document.getElementById('auraOrbRing');
  if (orb)  orb.style.background  = rank.color.replace(')', ',0.15)').replace('rgb','rgba').replace('rgba(rgba','rgba');
  if (ring) ring.style.borderColor = rank.color;

  const fill = document.getElementById('auraBarFill');
  if (fill && next) {
    const pct = Math.min(100, Math.round((pts-rank.min)/(next.min-rank.min)*100));
    setTimeout(() => fill.style.width = pct+'%', 300);
    const lbl = document.getElementById('auraNextLbl');
    if (lbl) lbl.textContent = (next.min-pts) + ' до ' + next.name;
    fill.style.background = rank.color;
  }

  // Challenges
  const list = document.getElementById('challengesList');
  const resetBadge = document.getElementById('resetBadge');
  if (chR.ok && list) {
    const daysLeft = ((8 - new Date().getDay()) % 7) || 7;
    if (resetBadge) resetBadge.textContent = '⏱ сброс через ' + daysLeft + ' дн.';

    list.innerHTML = chR.challenges.map(ch => {
      const done = ch.completed;
      const prog = ch.progress || {cur:0,max:1};
      const pct  = Math.min(100, Math.round(prog.cur/prog.max*100));
      return `
        <div class="challenge-item" style="${done ? 'border-color:rgba(255,43,43,0.2);' : ''}">
          <div class="ch-emoji">${ch.emoji}</div>
          <div class="ch-body">
            <div class="ch-name" style="${done ? 'color:rgba(255,255,255,0.9)' : ''}">${ch.name}</div>
            <div class="ch-desc">${ch.desc}</div>
            <div class="ch-bar"><div class="ch-bar-fill" style="width:${pct}%"></div></div>
            ${prog.max > 1 ? `<div class="ch-prog">${prog.cur} / ${prog.max}</div>` : ''}
          </div>
          <div class="ch-aura">+${ch.aura} ✦</div>
          ${done ? `<div class="ch-done"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ff2b2b" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>` : ''}
        </div>`;
    }).join('');
  }

  // Achievements
  if (achR.ok && achR.achievements) {
    const earned = achR.achievements.filter(a => a.earned);
    const locked = achR.achievements.filter(a => !a.earned);

    const earnedEl = document.getElementById('achEarned');
    if (earnedEl) earnedEl.innerHTML = earned.length
      ? earned.map(a => `
          <div class="ach-badge" title="${a.desc}">
            <div class="ach-emoji">${a.emoji}</div>
            <div class="ach-name">${a.name}</div>
          </div>`).join('')
      : '<div style="grid-column:1/-1;font-size:12px;color:rgba(255,255,255,0.3);padding:8px 0;">Пока нет достижений — слушай музыку!</div>';

    const lockedEl = document.getElementById('achLocked');
    if (lockedEl) lockedEl.innerHTML = locked.map(a => `
      <div class="ach-locked-item" title="${a.desc}">
        <span class="ach-locked-emoji">${a.emoji}</span>
        <span class="ach-locked-name">${a.name}</span>
        <span class="ach-locked-aura">+${a.aura}</span>
      </div>`).join('');
  }
})();
