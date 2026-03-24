window.AuraMap = (() => {
  const U = window.AuraUtils;

  function renderMap() {
    const canvas = document.querySelector('[data-map-canvas]');
    const list = document.querySelector('[data-map-list]');
    if (!canvas || !list) return;
    const user = U.requireAuth();
    const users = U.getUsers().filter(item => item.id !== user.id);

    const points = [
      { label: 'You', left: '48%', top: '44%', me: true },
      { label: 'M', left: '28%', top: '22%' },
      { label: 'K', left: '68%', top: '31%' },
      { label: 'N', left: '58%', top: '66%' },
      { label: 'Club', left: '22%', top: '62%', hotspot: true },
      { label: 'Bar', left: '76%', top: '58%', hotspot: true }
    ];

    canvas.innerHTML = points.map(point => `
      <div class="map-pin ${point.hotspot ? 'hotspot' : ''}" style="left:${point.left}; top:${point.top};">
        ${point.label}
      </div>
    `).join('');

    list.innerHTML = users.map(item => `
      <div class="list-card">
        <div class="row-between">
          <div class="user-line">
            ${U.avatarMarkup(item, 'sm')}
            <div>
              <strong>${item.name}</strong>
              <p class="muted">${item.nowPlaying?.title || 'No active track'} • ${item.distanceKm} km</p>
            </div>
          </div>
          <button class="btn btn-secondary btn-small">Signal</button>
        </div>
      </div>
    `).join('') + `
      <div class="list-card">
        <div class="row-between">
          <div>
            <strong>Basement Pulse</strong>
            <p class="muted">Sponsored hotspot • Techno night • 1.4 km</p>
          </div>
          <span class="tag active">Live</span>
        </div>
      </div>
    `;
  }

  document.addEventListener('DOMContentLoaded', renderMap);
})();
