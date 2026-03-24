window.AuraMusic = (() => {
  const U = window.AuraUtils;

  const demoTracks = [
    { title: 'Blinding Lights', artist: 'The Weeknd', progress: 41 },
    { title: 'RAVE', artist: 'Dxrk ダーク', progress: 58 },
    { title: 'FE!N', artist: 'Travis Scott', progress: 35 },
    { title: 'Genesis', artist: 'Grimes', progress: 67 }
  ];

  function connectSpotifyDemo() {
    const user = U.requireAuth();
    const track = demoTracks[Math.floor(Math.random() * demoTracks.length)];
    U.updateUser({
      ...user,
      spotifyConnected: true,
      spotifyProfile: { provider: 'Spotify', username: `${(user.name || 'aura').toLowerCase().replace(/\s+/g, '.')}.signal` },
      nowPlaying: track,
      vibeTags: Array.from(new Set([...(user.vibeTags || []), track.artist, 'Live radar']))
    });
    return track;
  }

  function disconnectSpotify() {
    const user = U.requireAuth();
    U.updateUser({ ...user, spotifyConnected: false, spotifyProfile: null, nowPlaying: null });
  }

  function bindConnectMusic() {
    const root = document.querySelector('[data-connect-music]');
    if (!root) return;
    const user = U.requireAuth();
    const status = root.querySelector('[data-music-status]');

    function render() {
      const freshUser = U.getCurrentUser();
      status.className = `notice ${freshUser.spotifyConnected ? 'success' : 'warn'}`;
      status.textContent = freshUser.spotifyConnected
        ? `Spotify linked as ${freshUser.spotifyProfile?.username || 'connected user'}`
        : 'Spotify not connected yet. You can still explore the shell of the app.';
    }

    root.querySelector('[data-connect-spotify]').addEventListener('click', () => {
      const track = connectSpotifyDemo();
      render();
      U.showToast(`Spotify demo linked. Now playing: ${track.title} — ${track.artist}`);
    });

    root.querySelector('[data-skip-music]').addEventListener('click', () => U.redirect('/home'));
    root.querySelector('[data-go-home]').addEventListener('click', () => U.redirect('/home'));

    if (new URLSearchParams(location.search).get('spotify') === 'connected') {
      connectSpotifyDemo();
    }

    render();
  }

  document.addEventListener('DOMContentLoaded', bindConnectMusic);

  return { connectSpotifyDemo, disconnectSpotify };
})();
