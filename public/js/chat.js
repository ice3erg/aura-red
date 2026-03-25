window.AuraChat = (() => {
  const U = window.AuraUtils;

  function fillSignals() {
    const root = document.querySelector('[data-signals-list]');
    if (!root) return;
    const user = U.requireAuth();
    const users = U.getUsers();
    const signals = U.getSignals().filter(item => item.toId === user.id);

    root.innerHTML = signals.map(signal => {
      const from = users.find(item => item.id === signal.fromId);
      return `
        <div class="list-card">
          <div class="row-between">
            <div class="user-line">
              ${U.avatarMarkup(from, 'sm')}
              <div>
                <strong>${from?.name || 'Unknown'}</strong>
                <p class="muted">${signal.type} • ${signal.time}</p>
              </div>
            </div>
            <div class="row gap-8">
              <a href="/chat" class="btn btn-primary btn-small">Open</a>
              <button class="btn btn-secondary btn-small">Ignore</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function fillChats() {
    const root = document.querySelector('[data-chat-list]');
    if (!root) return;
    U.requireAuth();
    const chats = U.getChats();

    root.innerHTML = chats.map(chat => `
      <div class="chat-card">
        <div class="row-between">
          <div>
            <strong>${chat.title}</strong>
            <p class="muted">${chat.lastMessage}</p>
          </div>
          ${chat.unread ? `<span class="tag active">${chat.unread} new</span>` : '<span class="tag">Read</span>'}
        </div>
      </div>
    `).join('') + `
      <div class="chat-card">
        <strong>Active room</strong>
        <p class="muted mt-16">This MVP keeps chat lightweight. Next step: message composer, track share, live pings.</p>
      </div>
    `;
  }

  document.addEventListener('DOMContentLoaded', () => {
    fillSignals();
    fillChats();
  });
})();
