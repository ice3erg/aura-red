(function () {
  const U = window.AuraUtils;
  let _me = null;
  let _activeChatId = null;

  function timeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60)    return 'только что';
    if (diff < 3600)  return Math.floor(diff/60) + ' мин';
    if (diff < 86400) return Math.floor(diff/3600) + ' ч';
    return new Date(ts).toLocaleDateString('ru', { day:'numeric', month:'short' });
  }

  function avaHtml(user, size = 42) {
    const s = `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;`;
    if (user?.avatar) return `<img src="${user.avatar}" style="${s}background:#1a1a22;" alt="" />`;
    const init = (user?.name || '?')[0].toUpperCase();
    return `<div style="${s}background:#2a1a1a;border:1px solid #3a2020;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*.38)}px;font-weight:800;color:#ff2b2b;">${init}</div>`;
  }

  // ── Signals ────────────────────────────────────────────
  async function loadSignals() {
    const root = document.getElementById('signalList');
    if (!root) return;
    try {
      const r = await fetch('/api/signals');
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error();
      const pending = d.signals.filter(s => s.status === 'pending');
      const countEl = document.getElementById('signalCount');
      if (countEl) countEl.textContent = pending.length ? ` · ${pending.length}` : '';
      if (!pending.length) {
        root.innerHTML = `<div class="empty-state"><div class="empty-icon">📡</div><p>Сигналов пока нет.<br>Когда кто-то слушает то же что ты — ты появишься на их радаре.</p></div>`;
        return;
      }
      const matchBadge = {
        'same-track':  { cls:'red',   text:'🔴 тот же трек' },
        'same-artist': { cls:'white', text:'⚪ тот же артист' },
        'same-vibe':   { cls:'gray',  text:'⚫ похожий вайб' },
      };
      root.innerHTML = pending.map(sig => {
        const from  = sig.from;
        const badge = matchBadge[sig.matchType] || matchBadge['same-vibe'];
        return `<div class="signal-card" data-sig-id="${sig.id}">
          ${avaHtml(from, 46)}
          <div class="signal-body">
            <div class="signal-name">${from?.name || 'Аноним'}</div>
            <div class="signal-track">🎵 ${sig.artist} — ${sig.track}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0;">
            <div class="signal-badge ${badge.cls}">${badge.text}</div>
            <div style="display:flex;gap:6px;">
              <button class="sig-accept" data-id="${sig.id}" style="padding:5px 11px;border-radius:8px;background:rgba(255,43,43,.15);color:#ff6b6b;border:1px solid rgba(255,43,43,.3);font:inherit;font-size:12px;font-weight:700;cursor:pointer;">Ответить</button>
              <button class="sig-ignore" data-id="${sig.id}" style="padding:5px 11px;border-radius:8px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.08);font:inherit;font-size:12px;cursor:pointer;">Игнор</button>
            </div>
          </div>
        </div>`;
      }).join('');

      root.querySelectorAll('.sig-accept').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          btn.disabled = true; btn.textContent = '...';
          const r = await fetch(`/api/signals/${id}/accept`, { method:'POST' });
          const d = await r.json();
          if (d.ok) { switchTab('chats'); await loadChats(); if (d.chatId) openChat(d.chatId); }
          loadSignals();
        });
      });
      root.querySelectorAll('.sig-ignore').forEach(btn => {
        btn.addEventListener('click', async () => {
          await fetch(`/api/signals/${btn.dataset.id}/ignore`, { method:'POST' });
          loadSignals();
        });
      });
    } catch {
      root.innerHTML = `<div class="empty-state"><div class="empty-icon">📡</div><p>Не удалось загрузить сигналы.</p></div>`;
    }
  }

  // ── Chats list ─────────────────────────────────────────
  async function loadChats() {
    const root = document.getElementById('chatList');
    if (!root) return;
    try {
      const r = await fetch('/api/chats');
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error();
      if (!d.chats.length) {
        root.innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><p>Чатов пока нет.<br>Найди людей на радаре и отправь сигнал!</p></div>`;
        return;
      }
      root.innerHTML = d.chats.map(chat => {
        const other    = chat.other;
        const last     = chat.lastMsg;
        const isMine   = last?.fromId === _me?.id;
        const lastText = last ? (isMine ? `Вы: ${last.text}` : last.text) : 'Нет сообщений';
        return `<div class="chat-item" data-chat-id="${chat.id}">
          <div style="position:relative;flex-shrink:0;">${avaHtml(other, 46)}</div>
          <div class="chat-item-body">
            <div class="chat-item-name">${other?.name || 'Аноним'}</div>
            <div class="chat-item-last ${chat.unread ? 'unread' : ''}">${lastText}</div>
          </div>
          <div class="chat-item-meta">
            <div class="chat-item-time">${last ? timeAgo(last.createdAt) : ''}</div>
            ${chat.unread ? `<div class="unread-badge">${chat.unread}</div>` : ''}
          </div>
        </div>`;
      }).join('');
      root.querySelectorAll('.chat-item').forEach(el => {
        el.addEventListener('click', () => openChat(el.dataset.chatId));
      });
      const totalUnread = d.chats.reduce((s,c) => s + (c.unread||0), 0);
      const sub = document.getElementById('chatSub');
      if (sub) sub.textContent = totalUnread ? `${totalUnread} новых` : 'Нет новых сообщений';
    } catch {
      root.innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><p>Не удалось загрузить чаты.</p></div>`;
    }
  }

  // ── Open chat ──────────────────────────────────────────
  async function openChat(chatId) {
    _activeChatId = chatId;
    const overlay  = document.getElementById('chatOverlay');
    const msgList  = document.getElementById('msgList');
    const chatName = document.getElementById('chatOtherName');
    if (!overlay) return;
    overlay.classList.add('open');
    msgList.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,.3);font-size:13px;">Загрузка...</div>';
    try {
      const [chatsR, msgsR] = await Promise.all([
        fetch('/api/chats').then(r=>r.json()),
        fetch(`/api/chats/${chatId}/messages`).then(r=>r.json())
      ]);
      const chat  = chatsR.chats?.find(c => c.id === chatId);
      const other = chat?.other;
      if (chatName) chatName.textContent = other?.name || 'Аноним';
      renderMessages(msgsR.messages || [], other);
    } catch {
      msgList.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,.3);">Ошибка загрузки.</div>';
    }
  }

  function renderMessages(messages, other) {
    const msgList = document.getElementById('msgList');
    if (!messages.length) {
      msgList.innerHTML = '<div style="text-align:center;padding:32px 20px;color:rgba(255,255,255,.3);font-size:13px;">Начни общение 👋</div>';
      return;
    }
    msgList.innerHTML = messages.map(msg => {
      const isMine  = msg.fromId === _me?.id;
      if (msg.fromId === 'system') {
        return `<div style="text-align:center;padding:8px 16px;font-size:12px;color:rgba(255,255,255,.35);">${msg.text}</div>`;
      }
      return `<div style="display:flex;justify-content:${isMine?'flex-end':'flex-start'};margin:4px 0;padding:0 16px;">
        <div style="max-width:72%;padding:10px 14px;border-radius:${isMine?'18px 18px 4px 18px':'18px 18px 18px 4px'};background:${isMine?'rgba(255,43,43,.25)':'rgba(255,255,255,.07)'};border:1px solid ${isMine?'rgba(255,43,43,.3)':'rgba(255,255,255,.08)'};font-size:14px;line-height:1.45;">
          ${msg.text}
        </div>
      </div>`;
    }).join('');
    msgList.scrollTop = msgList.scrollHeight;
  }

  async function sendMsg() {
    if (!_activeChatId) return;
    const input = document.getElementById('msgInput');
    const text  = input?.value.trim();
    if (!text) return;
    input.value = '';
    try {
      const r = await fetch(`/api/chats/${_activeChatId}/messages`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ text })
      });
      const d = await r.json();
      if (d.ok) {
        const msgsR  = await fetch(`/api/chats/${_activeChatId}/messages`).then(r=>r.json());
        const chatsR = await fetch('/api/chats').then(r=>r.json());
        const chat   = chatsR.chats?.find(c => c.id === _activeChatId);
        renderMessages(msgsR.messages||[], chat?.other);
      }
    } catch {}
  }

  // ── Init ───────────────────────────────────────────────
  async function init() {
    _me = await U.requireAuth();
    if (!_me) return;

    const overlay  = document.getElementById('chatOverlay');
    const backBtn  = document.getElementById('chatBackBtn');
    const sendBtn  = document.getElementById('msgSendBtn');
    const msgInput = document.getElementById('msgInput');

    if (backBtn) backBtn.addEventListener('click', () => {
      overlay?.classList.remove('open'); _activeChatId = null; loadChats();
    });
    if (sendBtn)  sendBtn.addEventListener('click', sendMsg);
    if (msgInput) msgInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });

    const params = new URLSearchParams(location.search);
    const chatId = params.get('chatId');
    await Promise.all([loadChats(), loadSignals()]);
    if (chatId) openChat(chatId);

    setInterval(() => {
      if (_activeChatId) {
        fetch(`/api/chats/${_activeChatId}/messages`).then(r=>r.json()).then(d => {
          if (d.ok) renderMessages(d.messages, null);
        });
      }
      loadSignals();
    }, 10000);
  }

  window.switchTab = function(tab) {
    document.querySelectorAll('.chat-tab').forEach((t, i) => {
      t.classList.toggle('active', (i===0&&tab==='chats')||(i===1&&tab==='signals'));
    });
    document.querySelectorAll('.chat-section').forEach(s => s.classList.remove('active'));
    document.getElementById('tab-' + tab)?.classList.add('active');
  };

  window.openChat = openChat;
  document.addEventListener('DOMContentLoaded', init);
})();
