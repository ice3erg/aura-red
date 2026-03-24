window.AuraProfile = (() => {
  const U = window.AuraUtils;

  function saveOnboarding(payload) {
    const user = U.requireAuth();
    const nextUser = {
      ...user,
      name: payload.name,
      age: payload.age,
      city: payload.city,
      avatar: payload.avatar,
      bio: payload.bio,
      vibeTags: payload.vibeTags || user.vibeTags || []
    };
    U.updateUser(nextUser);
    return nextUser;
  }

  function bindOnboardingForm() {
    const form = document.querySelector('[data-onboarding-form]');
    if (!form) return;
    const user = U.requireAuth();

    form.elements.name.value = user.name || '';
    form.elements.age.value = user.age || '';
    form.elements.city.value = user.city || '';
    form.elements.avatar.value = user.avatar || '';
    form.elements.bio.value = user.bio || '';

    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      const age = String(data.get('age') || '').trim();
      const city = String(data.get('city') || '').trim();
      const avatar = String(data.get('avatar') || '').trim();
      const bio = String(data.get('bio') || '').trim();
      const notice = document.querySelector('[data-form-notice]');

      try {
        if (!name || !city) throw new Error('Укажи имя и город.');
        saveOnboarding({ name, age, city, avatar, bio, vibeTags: ['Night city', 'Open radar'] });
        U.redirect('/connect-music');
      } catch (error) {
        if (notice) {
          notice.className = 'notice error';
          notice.textContent = error.message;
          notice.classList.remove('hidden');
        }
      }
    });
  }

  function fillProfilePage() {
    const root = document.querySelector('[data-profile-root]');
    if (!root) return;
    const user = U.requireAuth();

    root.querySelector('[data-profile-avatar]').innerHTML = U.avatarMarkup(user, 'lg');
    root.querySelector('[data-profile-name]').textContent = user.name || 'Unnamed';
    root.querySelector('[data-profile-meta]').textContent = [user.age ? `${user.age} y.o.` : '', user.city].filter(Boolean).join(' • ');
    root.querySelector('[data-profile-bio]').textContent = user.bio || 'Tell people what your scene feels like.';
    root.querySelector('[data-profile-spotify]').textContent = user.spotifyConnected ? 'Connected' : 'Not connected';
    root.querySelector('[data-profile-email]').textContent = user.email;
    root.querySelector('[data-profile-vibes]').innerHTML = (user.vibeTags?.length ? user.vibeTags : ['No tags yet'])
      .map(tag => `<span class="tag active">${tag}</span>`)
      .join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindOnboardingForm();
    fillProfilePage();
  });

  return { saveOnboarding };
})();
