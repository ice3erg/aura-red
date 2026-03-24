window.AuraUtils = (() => {
  const KEYS = {
    users: 'aura_users',
    session: 'aura_session',
    signals: 'aura_signals',
    chats: 'aura_chats'
  };

  const seedUsers = [
    {
      id: 'u_demo_1',
      email: 'max@aura.app',
      password: '123456',
      name: 'Max',
      age: '21',
      city: 'Saint Petersburg',
      avatar: '',
      bio: 'Night drives, heavy bass, real scenes.',
      spotifyConnected: true,
      spotifyProfile: { provider: 'Spotify', username: 'max.redmode' },
      nowPlaying: { title: 'After Hours', artist: 'The Weeknd', progress: 48 },
      vibeTags: ['Dark pop', 'Night ride', 'Synth'],
      lastSeen: 'now',
      distanceKm: 0
    },
    {
      id: 'u_demo_2',
      email: 'mila@aura.app',
      password: '123456',
      name: 'Mila',
      age: '22',
      city: 'Saint Petersburg',
      avatar: '',
      bio: 'Techno, afterparty, underground spots.',
      spotifyConnected: true,
      spotifyProfile: { provider: 'Spotify', username: 'mila.noise' },
      nowPlaying: { title: 'Breathe', artist: 'The Prodigy', progress: 62 },
      vibeTags: ['Techno', 'Clubs'],
      lastSeen: '2 min ago',
      distanceKm: 1.2
    },
    {
      id: 'u_demo_3',
      email: 'kai@aura.app',
      password: '123456',
      name: 'Kai',
      age: '24',
      city: 'Saint Petersburg',
      avatar: '',
      bio: 'Alt rap, visuals, hidden bars.',
      spotifyConnected: true,
      spotifyProfile: { provider: 'Spotify', username: 'kai.signal' },
      nowPlaying: { title: 'FE!N', artist: 'Travis Scott', progress: 33 },
      vibeTags: ['Rap', 'Visuals'],
      lastSeen: 'online',
      distanceKm: 2.4
    }
  ];

  function bootstrap() {
    if (!localStorage.getItem(KEYS.users)) {
      localStorage.setItem(KEYS.users, JSON.stringify(seedUsers));
    }
    if (!localStorage.getItem(KEYS.signals)) {
      localStorage.setItem(KEYS.signals, JSON.stringify([
        { id: uid('sig'), fromId: 'u_demo_2', toId: 'u_demo_1', type: 'Same vibe', time: '3m ago', mutual: true },
        { id: uid('sig'), fromId: 'u_demo_3', toId: 'u_demo_1', type: 'Hello', time: '12m ago', mutual: false }
      ]));
    }
    if (!localStorage.getItem(KEYS.chats)) {
      localStorage.setItem(KEYS.chats, JSON.stringify([
        { id: uid('chat'), userIds: ['u_demo_1', 'u_demo_2'], title: 'Mila', lastMessage: 'There is a techno set tonight near Sennaya.', unread: 1 },
        { id: uid('chat'), userIds: ['u_demo_1', 'u_demo_3'], title: 'Kai', lastMessage: 'Same track energy.', unread: 0 }
      ]));
    }
  }

  function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getUsers() {
    bootstrap();
    return read(KEYS.users, []);
  }

  function saveUsers(users) {
    write(KEYS.users, users);
  }

  function getSession() {
    return read(KEYS.session, null);
  }

  function setSession(session) {
    write(KEYS.session, session);
  }

  function clearSession() {
    localStorage.removeItem(KEYS.session);
  }

  function getCurrentUser() {
    const session = getSession();
    if (!session?.userId) return null;
    return getUsers().find(user => user.id === session.userId) || null;
  }

  function updateUser(nextUser) {
    const users = getUsers();
    const index = users.findIndex(item => item.id === nextUser.id);
    if (index === -1) return;
    users[index] = { ...users[index], ...nextUser };
    saveUsers(users);
  }

  function redirect(path) {
    window.location.href = path;
  }

  function requireAuth() {
    const user = getCurrentUser();
    if (!user) redirect('/login');
    return user;
  }

  function showToast(message) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function initials(name = 'A') {
    return name
      .split(' ')
      .map(part => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  function avatarMarkup(user, size = '') {
    const cls = ['avatar', size].filter(Boolean).join(' ');
    if (user?.avatar) return `<img class="${cls}" src="${user.avatar}" alt="${user.name || 'avatar'}">`;
    return `<div class="${cls}" aria-hidden="true">${initials(user?.name || 'A')}</div>`;
  }

  function getSignals() { return read(KEYS.signals, []); }
  function getChats() { return read(KEYS.chats, []); }

  return {
    KEYS,
    bootstrap,
    uid,
    read,
    write,
    getUsers,
    saveUsers,
    getSession,
    setSession,
    clearSession,
    getCurrentUser,
    updateUser,
    redirect,
    requireAuth,
    showToast,
    initials,
    avatarMarkup,
    getSignals,
    getChats
  };
})();

window.AuraUtils.bootstrap();
