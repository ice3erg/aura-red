export default function ConnectMusicPage() {
  const apiBase = "http://localhost:4000/api";

  function connectSpotify() {
    window.location.href = `${apiBase}/spotify/login`;
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 24 }}>
      <h1>Подключить Spotify</h1>
      <p>Нажми кнопку ниже, чтобы связать аккаунт.</p>
      <button onClick={connectSpotify} style={{ padding: 12 }}>
        Подключить Spotify
      </button>
    </div>
  );
}
