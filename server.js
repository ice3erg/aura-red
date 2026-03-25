require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt  = require("bcryptjs");
const axios   = require("axios");
const path    = require("path");
const db      = require("./db");

const app       = express();
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir));
app.use(express.json({ limit: "5mb" }));
app.use(session({
  secret:            process.env.SESSION_SECRET || "aura-dev-secret-change-in-prod",
  resave:            false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI  = process.env.SPOTIFY_REDIRECT_URI;

// ── Pages ─────────────────────────────────────────────────
const pages = {
  "/": "index.html", "/login": "login.html", "/signup": "signup.html",
  "/onboarding": "onboarding.html", "/connect-music": "connect-music.html",
  "/connect-success": "connect-success.html", "/home": "home.html",
  "/profile": "profile.html", "/map": "map.html", "/chat": "chat.html"
};
Object.entries(pages).forEach(([r, f]) =>
  app.get(r, (_, res) => res.sendFile(path.join(publicDir, f)))
);

// ── Auth middleware ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ ok: false, error: "Не авторизован" });
  const user = db.findById(req.session.userId);
  if (!user) { req.session.destroy(); return res.status(401).json({ ok: false, error: "Пользователь не найден" }); }
  req.user = user;
  next();
}

// ── Auth API ──────────────────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)       return res.status(400).json({ ok: false, error: "Заполни все поля" });
  if (password.length < 6)       return res.status(400).json({ ok: false, error: "Пароль не короче 6 символов" });
  if (db.findByEmail(email))     return res.status(409).json({ ok: false, error: "Почта уже используется" });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = db.createUser({ email, passwordHash });
  req.session.userId = user.id;
  res.json({ ok: true, user: db.publicProfile(user), needsOnboarding: true });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, error: "Заполни все поля" });
  const user = db.findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ ok: false, error: "Неверная почта или пароль" });
  req.session.userId = user.id;
  res.json({ ok: true, user: db.publicProfile(user), needsOnboarding: !user.name || !user.city });
});

app.post("/api/auth/logout", (req, res) => { req.session.destroy(); res.json({ ok: true }); });

app.get("/api/auth/me", requireAuth, (req, res) =>
  res.json({ ok: true, user: db.publicProfile(req.user) })
);

// ── Profile API ───────────────────────────────────────────
app.patch("/api/profile", requireAuth, (req, res) => {
  const { name, age, city, bio, avatar, spotifyConnected, spotifyName, spotifyAccessToken, spotifyRefreshToken } = req.body;
  const u = req.user;
  const updated = db.updateUser(u.id, {
    name:   name   !== undefined ? String(name).trim().slice(0, 40)  : u.name,
    age:    age    !== undefined ? String(age).trim()                 : u.age,
    city:   city   !== undefined ? String(city).trim().slice(0, 60)  : u.city,
    bio:    bio    !== undefined ? String(bio).trim().slice(0, 300)  : u.bio,
    avatar: avatar !== undefined ? avatar                             : u.avatar,
    ...(spotifyConnected    !== undefined && { spotifyConnected }),
    ...(spotifyName         !== undefined && { spotifyName }),
    ...(spotifyAccessToken  !== undefined && { spotifyAccessToken }),
    ...(spotifyRefreshToken !== undefined && { spotifyRefreshToken }),
  });
  res.json({ ok: true, user: db.publicProfile(updated) });
});

// ── Debug ─────────────────────────────────────────────────
app.get("/debug/env", (_, res) => res.json({
  hasClientId: !!CLIENT_ID, hasClientSecret: !!CLIENT_SECRET, redirectUri: REDIRECT_URI || null
}));

// ── Spotify helpers ───────────────────────────────────────
const spotifyB64 = () => "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

async function refreshToken(rt) {
  const r = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt }).toString(),
    { headers: { Authorization: spotifyB64(), "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
  );
  return r.data;
}

async function fetchTrack(at) {
  return axios.get("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${at}` }, validateStatus: () => true, timeout: 15000
  });
}

// ── Spotify OAuth ─────────────────────────────────────────
app.get("/spotify/login", (_, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI)
    return res.status(500).send("Не заданы переменные Spotify в .env");
  const scope = "user-read-email user-read-private user-read-currently-playing user-read-playback-state";
  res.redirect("https://accounts.spotify.com/authorize?" +
    new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, scope, redirect_uri: REDIRECT_URI }));
});

app.get("/callback", async (req, res) => {
  const { code, error: err } = req.query;
  if (err)   return res.redirect(`/connect-music?error=${encodeURIComponent(err)}`);
  if (!code) return res.redirect("/connect-music?error=no_code");
  try {
    const tok = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({ code, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" }).toString(),
      { headers: { Authorization: spotifyB64(), "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
    );
    const { access_token, refresh_token } = tok.data;
    const me = (await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` }, timeout: 15000
    })).data;

    if (req.session?.userId) {
      db.updateUser(req.session.userId, {
        spotifyConnected: true, spotifyName: me.display_name || "",
        spotifyId: me.id || "", spotifyAccessToken: access_token, spotifyRefreshToken: refresh_token || ""
      });
      return res.redirect("/connect-success?" + new URLSearchParams({
        spotifyConnected: "true", spotifyName: me.display_name || ""
      }));
    }
    res.redirect("/connect-success?" + new URLSearchParams({
      spotifyConnected: "true", spotifyName: me.display_name || "",
      spotifyId: me.id || "", accessToken: access_token, refreshToken: refresh_token || ""
    }));
  } catch (e) {
    console.error("[callback]", e.response?.data || e.message);
    res.redirect("/connect-music?error=spotify_callback_failed");
  }
});

app.get("/spotify/callback", (req, res) => {
  const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.redirect(`/callback${q}`);
});

app.post("/api/spotify/refresh", requireAuth, async (req, res) => {
  const rt = req.user.spotifyRefreshToken || req.body.refreshToken;
  if (!rt) return res.status(400).json({ ok: false, error: "Нет refreshToken" });
  try {
    const data = await refreshToken(rt);
    db.updateUser(req.user.id, {
      spotifyAccessToken: data.access_token,
      spotifyRefreshToken: data.refresh_token || rt
    });
    res.json({ ok: true, accessToken: data.access_token, expiresIn: data.expires_in || 3600 });
  } catch (e) {
    res.status(e.response?.status || 500).json({ ok: false, error: "Не удалось обновить токен" });
  }
});

app.get("/api/spotify/current-track", requireAuth, async (req, res) => {
  let at = req.user.spotifyAccessToken;
  let rt = req.user.spotifyRefreshToken;
  if (!at && req.query.accessToken) { at = req.query.accessToken; rt = req.query.refreshToken || rt; }
  if (!at) return res.status(400).json({ ok: false, error: "Spotify не подключён" });

  try {
    let r = await fetchTrack(at);
    if (r.status === 401 && rt) {
      try {
        const d = await refreshToken(rt);
        at = d.access_token;
        db.updateUser(req.user.id, { spotifyAccessToken: at, spotifyRefreshToken: d.refresh_token || rt });
        r = await fetchTrack(at);
      } catch { return res.status(401).json({ ok: false, error: "Сессия Spotify истекла. Переподключи Spotify." }); }
    } else if (r.status === 401) {
      return res.status(401).json({ ok: false, error: "Токен истёк. Переподключи Spotify." });
    }
    if (r.status === 204) return res.json({ ok: true, isPlaying: false, track: null });
    if (r.status >= 400)  return res.status(r.status).json({ ok: false, error: "Ошибка Spotify API" });

    const item = r.data?.item;
    if (!item) return res.json({ ok: true, isPlaying: false, track: null });
    res.json({
      ok: true, isPlaying: !!r.data.is_playing,
      track: {
        name:       item.name || "",
        artists:    item.artists?.map(a => a.name).join(", ") || "",
        album:      item.album?.name || "",
        image:      item.album?.images?.[0]?.url || "",
        url:        item.external_urls?.spotify || "",
        progressMs: r.data.progress_ms || 0,
        durationMs: item.duration_ms || 0
      }
    });
  } catch (e) {
    console.error("[current-track]", e.message);
    res.status(500).json({ ok: false, error: "Ошибка при получении трека" });
  }
});

app.use((_, res) => res.status(404).sendFile(path.join(publicDir, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`+aura запущен на http://127.0.0.1:${PORT}`));
