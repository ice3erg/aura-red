window.AuraHome = (() => {
  const U = window.AuraUtils;

  function fillHome() {
    const root = document.querySelector('[data-home-root]');
    if (!root) return;
    const user = U.requireAuth();
    const users = U.getUsers().filter(item => item.id !== user.id);

    root.querySelector('[data-home-avatar]').innerHTML = U.avatarMarkup(user);
    root.querySelector('[data-home-name]').textContent = user.name || 'New user';
    root.querySelector('[data-home-city]').textContent = user.city || 'Unknown city';

    const now = root.querySelector('[data-now-playing]');
    if (user.spotifyConnected && user.nowPlaying) {
      now.innerHTML = `
        <div class="row gap-16">
          <div class="cover">♫</div>
          <div class="stack" style="flex:1;">
            <div>
              <div class="eyebrow">Now playing</div>
              <h3>${user.nowPlaying.title}</h3>
              <p class="muted">${user.nowPlaying.artist}</p>
            </div>
            <div class="progress"><span style="width:${user.nowPlaying.progress || 42}%"></span></div>
          </div>
        </div>`;
    } else {
      now.innerHTML = `
        <div class="stack">
          <div class="eyebrow">Music connection</div>
          <h3>Connect Spotify to activate your live signal</h3>
          <p class="muted">Your track becomes your presence. Without music you only see the shell of the radar.</p>
          <a class="btn btn-primary btn-small" href="/connect-music">Connect Spotify</a>
        </div>`;
    }

    root.querySelector('[data-nearby-count]').textContent = String(users.length + 19);
    root.querySelector('[data-live-listeners]').innerHTML = users.slice(0, 3).map(item => `
      <div class="user-line list-card">
        ${U.avatarMarkup(item, 'sm')}
        <div style="flex:1;">
          <strong>${item.name}</strong>
          <p class="muted">${item.nowPlaying?.artist || 'No current track'} • ${item.distanceKm} km</p>
        </div>
        <span class="tag active">${item.nowPlaying?.title || 'Signal'}</span>
      </div>
    `).join('');
  }

  document.addEventListener('DOMContentLoaded', fillHome);
})();
