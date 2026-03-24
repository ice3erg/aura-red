import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../features/auth/store";
import { api } from "../shared/lib/api";
import { useEffect, useState } from "react";

type Track = {
  name: string;
  artist: string;
  album?: string | null;
  image?: string | null;
  url?: string | null;
  isPlaying?: boolean;
};

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [track, setTrack] = useState<Track | null>(null);
  const [spotifyConnected, setSpotifyConnected] = useState(false);

  useEffect(() => {
    void loadSpotify();
  }, []);

  async function loadSpotify() {
    try {
      const status = await api.get("/spotify/status");
      setSpotifyConnected(Boolean(status.data.connected));

      if (status.data.connected) {
        const current = await api.get("/spotify/current-track");
        setTrack(current.data.track);
      }
    } catch {
      setSpotifyConnected(false);
      setTrack(null);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 24 }}>
      <h1>+aura</h1>
      <p>Привет, {user?.profile?.name || user?.email}</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <Link to="/profile">Профиль</Link>
        <Link to="/connect-music">Подключить музыку</Link>
        <button onClick={handleLogout}>Выйти</button>
      </div>

      <h2>Spotify</h2>
      <p>{spotifyConnected ? "Подключен" : "Не подключен"}</p>

      {track ? (
        <div>
          <h3>Сейчас играет</h3>
          <p>
            <strong>{track.name}</strong> — {track.artist}
          </p>
          {track.image && (
            <img
              src={track.image}
              alt={track.name}
              style={{ width: 180, borderRadius: 12 }}
            />
          )}
        </div>
      ) : (
        <p>Трек не найден или музыка не играет.</p>
      )}
    </div>
  );
}
