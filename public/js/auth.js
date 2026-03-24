window.AuraAuth = (() => {
  const U = window.AuraUtils;

  function signUp(payload) {
    const users = U.getUsers();
    if (users.some(user => user.email.toLowerCase() === payload.email.toLowerCase())) {
      throw new Error('Аккаунт с таким email уже существует.');
    }

    const newUser = {
      id: U.uid('u'),
      email: payload.email,
      password: payload.password,
      name: '',
      age: '',
      city: '',
      avatar: '',
      bio: '',
      spotifyConnected: false,
      spotifyProfile: null,
      nowPlaying: null,
      vibeTags: [],
      createdAt: new Date().toISOString(),
      lastSeen: 'now',
      distanceKm: 0
    };

    users.push(newUser);
    U.saveUsers(users);
    U.setSession({ userId: newUser.id });
    return newUser;
  }

  function login(email, password) {
    const user = U.getUsers().find(
      item => item.email.toLowerCase() === email.toLowerCase() && item.password === password
    );

    if (!user) throw new Error('Неверный email или пароль.');
    U.setSession({ userId: user.id });
    return user;
  }

  function logout() {
    U.clearSession();
    U.redirect('/login');
  }

  function bindSignupForm() {
    const form = document.querySelector('[data-signup-form]');
    if (!form) return;
    form.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(form);
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');
      const confirmPassword = String(formData.get('confirmPassword') || '');
      const notice = document.querySelector('[data-form-notice]');

      try {
        if (!email || !password) throw new Error('Заполни email и пароль.');
        if (password.length < 6) throw new Error('Пароль должен быть не короче 6 символов.');
        if (password !== confirmPassword) throw new Error('Пароли не совпадают.');
        signUp({ email, password });
        U.redirect('/onboarding');
      } catch (error) {
        if (notice) {
          notice.className = 'notice error';
          notice.textContent = error.message;
          notice.classList.remove('hidden');
        }
      }
    });
  }

  function bindLoginForm() {
    const form = document.querySelector('[data-login-form]');
    if (!form) return;
    form.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(form);
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');
      const notice = document.querySelector('[data-form-notice]');

      try {
        const user = login(email, password);
        if (!user.name || !user.city) {
          U.redirect('/onboarding');
        } else {
          U.redirect('/home');
        }
      } catch (error) {
        if (notice) {
          notice.className = 'notice error';
          notice.textContent = error.message;
          notice.classList.remove('hidden');
        }
      }
    });
  }

  function bindLogout() {
    document.querySelectorAll('[data-logout]').forEach(btn => {
      btn.addEventListener('click', () => logout());
    });
  }

  function redirectIfAuthed() {
    const user = U.getCurrentUser();
    if (user && (location.pathname === '/login' || location.pathname === '/signup')) {
      U.redirect(user.name ? '/home' : '/onboarding');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    redirectIfAuthed();
    bindSignupForm();
    bindLoginForm();
    bindLogout();
  });

  return { signUp, login, logout };
})();
