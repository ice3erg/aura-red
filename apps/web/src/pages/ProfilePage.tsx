import { useEffect, useState } from "react";
import { api } from "../shared/lib/api";

type Profile = {
  name?: string | null;
  age?: number | null;
  city?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({
    name: "",
    age: null,
    city: "",
    bio: "",
    avatarUrl: "",
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    const { data } = await api.get("/profile/me");
    if (data.profile) setProfile(data.profile);
  }

  async function saveProfile() {
    const { data } = await api.patch("/profile/me", {
      ...profile,
      age: profile.age ? Number(profile.age) : null,
      avatarUrl: profile.avatarUrl || null,
    });
    setProfile(data.profile);
    setMessage("Профиль сохранён");
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 24 }}>
      <h1>Профиль</h1>

      <input
        placeholder="Имя"
        value={profile.name ?? ""}
        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
        style={{ display: "block", width: "100%", marginBottom: 12, padding: 12 }}
      />

      <input
        placeholder="Возраст"
        type="number"
        value={profile.age ?? ""}
        onChange={(e) =>
          setProfile({
            ...profile,
            age: e.target.value ? Number(e.target.value) : null,
          })
        }
        style={{ display: "block", width: "100%", marginBottom: 12, padding: 12 }}
      />

      <input
        placeholder="Город"
        value={profile.city ?? ""}
        onChange={(e) => setProfile({ ...profile, city: e.target.value })}
        style={{ display: "block", width: "100%", marginBottom: 12, padding: 12 }}
      />

      <textarea
        placeholder="О себе"
        value={profile.bio ?? ""}
        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
        style={{ display: "block", width: "100%", marginBottom: 12, padding: 12, minHeight: 120 }}
      />

      <input
        placeholder="Avatar URL"
        value={profile.avatarUrl ?? ""}
        onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })}
        style={{ display: "block", width: "100%", marginBottom: 12, padding: 12 }}
      />

      <button onClick={saveProfile} style={{ padding: 12 }}>
        Сохранить
      </button>

      {message && <p>{message}</p>}
    </div>
  );
}
