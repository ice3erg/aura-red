(function () {
  const U = window.AuraUtils;
  let _me = null;
  let _activeChatId = null;

  function timeAgo(ts) {
    const d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60)    return 'только что';
    if (d < 3600)  return Math.floor(d/60) + ' мин';
    if (d < 86400) return Math.floor(d/3600) + ' ч';
    return new Date(ts).toLocaleDateString('ru', {day:'numeric',month:'short'});
  }

  function ava(user, size=46) {
    const s = `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;`;
    if (user?.avatar) return `<img src="${user.avatar}" style="${s}" alt="" />`;
    const i = (user?.name||'?')[0].toUpperCase();
    return `<div style="${s}background:#2a1a1a;border:1px solid #3a2020;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*.38)}px;font-weight:800;color:#ff2b2b;">${i}</div>`;
  }

  const vibeLabel = {
    'same-track':  { text:'🔴 тот же трек',    cls:'vibe-track'  },
    'same-artist': { text:'⚪ тот же артист',  cls:'vibe-artist' },
    'same-vibe':   { text:'⚫ похожий вайб',   cls:'vibe-vibe'   },
  };

  // ── Signals sheet ──────────────────────────────────────
  let _signals = [];

  async function loadSignals() {
    try {
      const r = await fetch('/api/signals');
      const d = await r.json();
      if (!r.ok || !d.ok) return;
      _signals = d.signals.filter(s => s.status === 'pending');

      const el    = document.getElementById('pendingSignals');
      const badge = document.getElementById('pendingCount');
      const sub   = document.getElementById('pendingSubText');
      if (_signals.length > 0) {
        el.style.display = 'flex';
        badge.textContent = _signals.length;
        const names = _signals.slice(0,2).map(s => s.from?.name||'Аноним').join(', ');
        sub.textContent = names + (_signals.length > 2 ? ` и ещё ${_signals.length-2}` : '');
      } else {
        el.style.display = 'none';
      }
      renderSignalList();
    } catch {}
  }

  function renderSignalList() {
    const root = document.getElementById('signalList');
    if (!root) return;
    if (!_signals.length) {
      root.innerHTML = '<div style="text-align:center;padding:32px 20px;color:rgba(255,255,255,.3);font-size:14px;">Новых сигналов нет</div>';
      return;
    }
    root.innerHTML = _signals.map(sig => {
      const vibe = vibeLabel[sig.matchType] || vibeLabel['same-vibe'];
      return `<div class="sig-card">
        ${ava(sig.from, 44)}
        <div class="sig-body">
          <div class="sig-name">${sig.from?.name||'Аноним'} <span class="chat-row-vibe ${vibe.cls}">${vibe.text}</span></div>
          <div class="sig-track">🎵 ${sig.artist||'—'} — ${sig.track||'—'}</div>
          <div class="sig-actions">
            <button class="sig-btn accept" data-id="${sig.id}">Ответить</button>
            <button class="sig-btn ignore" data-id="${sig.id}">Игнор</button>
          </div>
        </div>
      </div>`;
    }).join('');

    root.querySelectorAll('.sig-btn.accept').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = '...';
        const r = await fetch(`/api/signals/${btn.dataset.id}/accept`, {method:'POST'});
        const d = await r.json();
        if (d.ok) { closeSignalsSheet(); await loadChats(); if (d.chatId) openChat(d.chatId); }
        await loadSignals();
      });
    });
    root.querySelectorAll('.sig-btn.ignore').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch(`/api/signals/${btn.dataset.id}/ignore`, {method:'POST'});
        await loadSignals();
      });
    });
  }

  // ── Уведомления о принятых сигналах ──────────────────
  async function loadNotifications() {
    try {
      const r = await fetch('/api/notifications');
      const d = await r.json();
      if (!d.ok || !d.notifications.length) return;

      // Показываем баннер для каждого непросмотренного
      d.notifications.forEach(n => {
        const name = n.to?.name || 'Кто-то';
        showToast(`✅ ${name} принял твой сигнал!`, n.chatId);
      });

      // Помечаем как просмотренные
      await fetch('/api/notifications/seen', { method: 'POST' });
    } catch {}
  }

  function showToast(text, chatId) {
    const existing = document.getElementById('signalToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'signalToast';
    toast.style.cssText = `
      position:fixed;top:calc(env(safe-area-inset-top)+16px);left:50%;
      transform:translateX(-50%);
      background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);
      color:#86efac;border-radius:16px;padding:12px 18px;
      font:700 14px/1.4 Inter,sans-serif;z-index:999;
      backdrop-filter:blur(20px);box-shadow:0 8px 32px rgba(0,0,0,0.4);
      cursor:pointer;max-width:calc(100vw - 32px);text-align:center;
      animation:slideDown 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
    `;
    toast.textContent = text;
    if (!document.getElementById('toast-style')) {
      const st = document.createElement('style');
      st.id = 'toast-style';
      st.textContent = `@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`;
      document.head.appendChild(st);
    }
    if (chatId) toast.onclick = () => { window.openChat(chatId); toast.remove(); };
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  window.openSignalsSheet = () => document.getElementById('signalsSheet').classList.add('open');
  window.closeSignalsSheet = () => document.getElementById('signalsSheet').classList.remove('open');
  document.getElementById('signalsSheet')?.addEventListener('click', e => {
    if (e.target === document.getElementById('signalsSheet')) window.closeSignalsSheet();
  });

  // ── Sent signals ───────────────────────────────────────
  let _sentSignals = [];

  async function loadSentSignals() {
    try {
      const r = await fetch('/api/signals?direction=sent');
      const d = await r.json();
      if (!r.ok || !d.ok) return;
      // Поддерживаем оба варианта ответа сервера
      const rawSent = (d.sentSignals || d.signals || []).filter(s => s.status === 'pending' && (!s.direction || s.direction === 'sent'));
      // Убираем сигналы если уже есть чат с этим человеком
      try {
        const chatsR = await fetch('/api/chats').then(r=>r.json()).catch(()=>({chats:[]}));
        const chatPartners = new Set((chatsR.chats||[]).map(ch=>ch.other?.id).filter(Boolean));
        _sentSignals = rawSent.filter(s => !chatPartners.has(s.toId || s.to?.id));
      } catch(_) {
        _sentSignals = rawSent;
      }
      const banner = document.getElementById('sentSignalsBanner');
      const badge  = document.getElementById('sentCount');
      const sub    = document.getElementById('sentSubText');
      if (_sentSignals.length > 0) {
        banner.style.display = 'flex';
        badge.textContent = _sentSignals.length;
        const names = _sentSignals.slice(0,2).map(s => s.to?.name || 'Аноним').join(', ');
        sub.textContent = names + (_sentSignals.length > 2 ? ` и ещё ${_sentSignals.length-2}` : '') + ' — ожидает ответа';
      } else {
        banner.style.display = 'none';
      }
      renderSentSignalList();
    } catch {}
  }

  function renderSentSignalList() {
    const root = document.getElementById('sentSignalList');
    if (!root) return;
    if (!_sentSignals.length) {
      root.innerHTML = '<div style="text-align:center;padding:32px 20px;color:rgba(255,255,255,.3);font-size:14px;">Нет отправленных сигналов</div>';
      return;
    }
    const vl = { 'same-track':'🔴 тот же трек','same-artist':'⚪ тот же артист','same-vibe':'⚫ похожий вайб' };
    root.innerHTML = _sentSignals.map(sig => {
      const mt = sig.matchType || 'same-vibe';
      return `<div class="sig-card" style="border-color:rgba(255,255,255,0.06);">
        ${ava(sig.to, 44)}
        <div class="sig-body">
          <div class="sig-name">${sig.to?.name||'Аноним'} <span style="font-size:10px;padding:1px 6px;border-radius:99px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.4);border:1px solid rgba(255,255,255,0.08);">ожидает</span></div>
          <div class="sig-track">🎵 ${sig.artist||'—'} — ${sig.track||'—'}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:4px;">${vl[mt]||mt}</div>
        </div>
      </div>`;
    }).join('');
  }

  window.openSentSignalsSheet  = () => document.getElementById('sentSignalsSheet').classList.add('open');
  window.closeSentSignalsSheet = () => document.getElementById('sentSignalsSheet').classList.remove('open');

  // ── Chat list ──────────────────────────────────────────
  async function loadChats() {
    const root = document.getElementById('chatList');
    if (!root) return;
    try {
      const r = await fetch('/api/chats');
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error();

      const totalUnread = d.chats.reduce((s,c) => s+(c.unread||0), 0);
      const sub = document.getElementById('chatSub');
      if (sub) sub.textContent = totalUnread ? `${totalUnread} непрочитанных` : 'Нет новых сообщений';

      if (!d.chats.length) {
        root.innerHTML = `<div class="empty-msgs">
          <div class="ei">📡</div>
          <p>Тут пока пусто.<br>Найди людей на радаре и отправь сигнал — они появятся здесь.</p>
          <a href="/home">Открыть радар</a>
        </div>`;
        return;
      }

      root.innerHTML = d.chats.map((chat, idx) => {
        const other  = chat.other;
        const last   = chat.lastMsg;
        const isMine = last?.fromId === _me?.id;
        const isSys  = last?.fromId === 'system';
        const lastTxt = last
          ? (isSys ? last.text : isMine ? `Вы: ${last.text}` : last.text)
          : 'Нет сообщений';
        // Непрочитанные = сообщения после последнего открытия чата
        const lastRead = getLastRead(chat.id);
        const hasUnread = last && !isMine && !isSys && last.createdAt > lastRead;
        return `${idx > 0 ? '<div class="divider"></div>' : ''}
        <div class="chat-row" data-chat-id="${chat.id}">
          <div class="chat-row-ava">${ava(other, 50)}</div>
          <div class="chat-row-body">
            <div class="chat-row-name">${other?.name||'Аноним'}</div>
            <div class="chat-row-last ${hasUnread?'unread':''}">${lastTxt}</div>
          </div>
          <div class="chat-row-meta">
            <div class="chat-row-time">${last ? timeAgo(last.createdAt) : ''}</div>
            ${hasUnread ? '<div class="unread-dot"></div>' : ''}
          </div>
        </div>`;
      }).join('');

      root.querySelectorAll('.chat-row').forEach(el => {
        el.addEventListener('click', () => openChat(el.dataset.chatId));
      });
    } catch {
      root.innerHTML = `<div class="empty-msgs"><div class="ei">💬</div><p>Не удалось загрузить чаты.</p></div>`;
    }
  }

  // ── Chat dialog ────────────────────────────────────────
  // Храним время последнего прочтения каждого чата
  function markRead(chatId) {
    const now = Date.now();
    try { localStorage.setItem('read_' + chatId, now); } catch(_) {}
    // Сообщаем серверу — это исправляет счётчик непрочитанных
    fetch(`/api/chats/${chatId}/read`, { method: 'POST' }).catch(() => {});
  }
  function getLastRead(chatId) {
    try { return parseInt(localStorage.getItem('read_' + chatId) || '0'); } catch(_) { return 0; }
  }

  async function openChat(chatId) {
    _activeChatId = chatId;
    markRead(chatId); // помечаем как прочитанное
    const dialog = document.getElementById('chatDialog');
    const msgs   = document.getElementById('dlgMessages');
    if (!dialog) return;
    dialog.classList.add('open');
    msgs.innerHTML = '<div style="text-align:center;padding:32px;color:rgba(255,255,255,.3);font-size:13px;">Загрузка...</div>';

    try {
      const [chatsR, msgsR] = await Promise.all([
        fetch('/api/chats').then(r => {
          if (r.status === 401) { window.location.href = '/login'; throw new Error('auth'); }
          return r.json();
        }),
        fetch(`/api/chats/${chatId}/messages`).then(r => {
          if (r.status === 401) { window.location.href = '/login'; throw new Error('auth'); }
          return r.json();
        })
      ]);

      const chat  = chatsR.chats?.find(c=>c.id===chatId);
      const other = chat?.other;

      const dlgName = document.getElementById('dlgName');
      const dlgAva  = document.getElementById('dlgAva');
      if (dlgName) dlgName.textContent = other?.name || 'Аноним';
      if (dlgAva)  dlgAva.innerHTML    = ava(other, 36);

      // Кнопка "Добавить в друзья" в диалоге
      const dlgFriendBtn = document.getElementById('dlgFriendBtn');
      if (dlgFriendBtn && other?.id) {
        dlgFriendBtn.style.display = '';
        fetch(`/api/friends/check/${other.id}`).then(r=>r.json()).then(fr => {
          dlgFriendBtn.textContent = fr.isFriend ? '✅' : '🤝';
          dlgFriendBtn.title = fr.isFriend ? 'Уже друзья' : 'Добавить в друзья';
          dlgFriendBtn.onclick = async (e) => {
            e.stopPropagation();
            if (fr.isFriend) return;
            await fetch('/api/friends/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({toId:other.id})});
            dlgFriendBtn.textContent = '✅';
            fr.isFriend = true;
          };
        }).catch(()=>{});
      }

      // Переход на профиль только по аватарке и имени, НЕ по всему хедеру
      const dlgAvaEl = document.getElementById('dlgAva');
      const dlgNameEl = document.getElementById('dlgName');
      if (other?.name) {
        const goProfile = (e) => { e.stopPropagation(); window.location.href = `/u/${encodeURIComponent(other.id || other.name)}`; };
        if (dlgAvaEl) { dlgAvaEl.style.cursor = 'pointer'; dlgAvaEl.onclick = goProfile; }
        if (dlgNameEl) { dlgNameEl.style.cursor = 'pointer'; dlgNameEl.onclick = goProfile; }
      }

      const dlgArrow = document.getElementById('dlgArrow');
      if (dlgArrow) dlgArrow.style.display = other?.name ? '' : 'none';

      if (!msgsR.ok) {
        msgs.innerHTML = `<div style="text-align:center;padding:32px;color:rgba(255,255,255,.3);">${msgsR.error || 'Не удалось загрузить сообщения'}</div>`;
        return;
      }

      renderMessages(msgsR.messages||[]);
    } catch(e) {
      if (e.message === 'auth') return;
      msgs.innerHTML = '<div style="text-align:center;padding:32px;color:rgba(255,255,255,.3);">Ошибка загрузки.<br><span style="font-size:11px;cursor:pointer;text-decoration:underline;" onclick="openChat(\''+chatId+'\')">Попробовать снова</span></div>';
    }
  }

  function renderMessages(messages) {
    const msgs = document.getElementById('dlgMessages');
    if (!messages.length) {
      msgs.innerHTML = '<div style="text-align:center;padding:48px 24px;color:rgba(255,255,255,.3);font-size:14px;">Начни общение 👋</div>';
      return;
    }
    msgs.innerHTML = messages.map(msg => {
      const isMine  = msg.fromId === _me?.id;
      const isSys   = msg.fromId === 'system';
      const cls     = isSys ? 'system' : isMine ? 'mine' : 'theirs';
      const time    = isSys ? '' : `<div class="msg-time">${timeAgo(msg.createdAt)}</div>`;
      return `<div class="msg-bubble ${cls}">${msg.text}${time}</div>`;
    }).join('');
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ── Typing indicator ──────────────────────────────────
  let _typingTimer = null;
  let _isTyping = false;

  function showTyping() {
    const el = document.getElementById('typingIndicator');
    if (el) { el.style.display = 'flex'; }
  }
  function hideTyping() {
    const el = document.getElementById('typingIndicator');
    if (el) { el.style.display = 'none'; }
  }

  async function sendMsg() {
    if (!_activeChatId) return;
    const input = document.getElementById('dlgInput');
    const text  = input?.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    _isTyping = false;
    hideTyping();
    markRead(_activeChatId);
    try {
      const r = await fetch(`/api/chats/${_activeChatId}/messages`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text})
      });
      const d = await r.json();
      if (d.ok) {
        const msgsR = await fetch(`/api/chats/${_activeChatId}/messages`).then(r=>r.json());
        renderMessages(msgsR.messages||[]);
        loadChats();
      }
    } catch {}
  }

  // ── Init ───────────────────────────────────────────────
  async function init() {
    _me = await U.requireAuth();
    if (!_me) return;

    // Back button
    document.getElementById('dlgBack')?.addEventListener('click', () => {
      document.getElementById('chatDialog').classList.remove('open');
      _activeChatId = null;
      loadChats();
    });

    // Send button
    document.getElementById('dlgSend')?.addEventListener('click', sendMsg);

    // Enter to send
    const input = document.getElementById('dlgInput');
    if (input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
      });
      // Auto-resize
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
    }

    // Open chat from URL param
    const chatId = new URLSearchParams(location.search).get('chatId');
    await Promise.all([loadChats(), loadSignals(), loadSentSignals()]);
    if (chatId) openChat(chatId);

    // Загружаем уведомления при старте
    loadNotifications();

    // Polling every 8 sec
    const _pollInterval = setInterval(async () => {
      if (document.hidden) return; // не поллим когда вкладка скрыта
      try {
        await Promise.all([loadSignals(), loadSentSignals(), loadNotifications()]);
        if (_activeChatId) {
          const r = await fetch(`/api/chats/${_activeChatId}/messages`).then(r => {
          if (r.status === 401) { window.location.href = '/login'; throw new Error('auth'); }
          return r.json();
        });
          if (r.ok) {
            const msgs = r.messages||[];
            const lastMsg = msgs[msgs.length-1];
            if (lastMsg && lastMsg.fromId !== _me?.id && lastMsg.fromId !== 'system') {
              const age = Date.now() - lastMsg.createdAt;
              if (age < 15000) showTyping(); else hideTyping();
            } else { hideTyping(); }
            renderMessages(msgs);
          }
        } else {
          loadChats();
        }
      } catch(_) {}
    }, 8000);
  }

  window.openChat = openChat;
  document.addEventListener('DOMContentLoaded', init);
})();
