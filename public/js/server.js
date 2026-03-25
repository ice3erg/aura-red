require("dotenv").config();

const express  = require("express");
const session  = require("express-session");
const bcrypt   = require("bcryptjs");
const axios    = require("axios");
const path     = require("path");
const db       = require("./db");

const app       = express();
const publicDir = path.join(__dirname, "public");

// ── Middleware ────────────────────────────────────────────
app.use(express.static(publicDir));
app.use(express.json());
app.use(session({
  secret:            process.env.SESSION_SECRET || "aura-dev-secret-change-in-prod",
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge:   7 * 24 * 60 * 60 * 1000  // 7 дней
  }
}));

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI  = process.env.SPOTIFY_REDIRECT_URI;

// ── Page routes ───────────────────────────────────────────
const pages = {
  "/":                "index.html",
  "/login":           "login.html",
  "/signup":          "signup.html",
  "/onboarding":      "onboarding.html",
  "/connect-music":   "connect-music.html",
  "/connect-success": "connect-success.html",
  "/home":            "home.html",
  "/profile":         "profile.html",
  "/map":             "map.html",
  "/chat":            "chat.html"
};

Object.entries(pages).forEach(([route, file]) => {
  app.get(route, (_req, res) => res.sendFile(path.join(publicDir, file)));
});

// ── Auth middleware ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ ok: false, error: "Не авторизован" });
  }
  const user = db.findById(req.session.userId);
  if (!user) {
    req.session.destroy();
    return res.status(401).json({ ok: false, error: "Пользователь не найден" });
  }
  req.user = user;
  next();
}

// ── POST /api/auth/signup ─────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "Заполни все поля" });
  }
  if (password.length < 6) {
    return res.status(400).json({ ok: false, error: "Пароль не короче 6 символов" });
  }
  if (db.findByEmail(email)) {
    return res.status(409).json({ ok: false, error: "Почта уже используется" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user         = db.createUser({ email, passwordHash });

  req.session.userId = user.id;
  res.json({ ok: true, user: db.publicProfile(user), needsOnboarding: true });
});

// ── POST /api/auth/login ──────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "Заполни все поля" });
  }

  const user = db.findByEmail(email);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Неверная почта или пароль" });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ ok: false, error: "Неверная почта или пароль" });
  }

  req.session.userId = user.id;
  const needsOnboarding = !user.name || !user.city;
  res.json({ ok: true, user: db.publicProfile(user), needsOnboarding });
});

// ── POST /api/auth/logout ─────────────────────────────────
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// ── GET /api/auth/me ──────────────────────────────────────
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: db.publicProfile(req.user) });
});

// ── PATCH /api/profile ────────────────────────────────────
app.patch("/api/profile", requireAuth, (req, res) => {
  const { name, age, city, bio, avatar } = req.body;

  const updated = db.updateUser(req.user.id, {
    name:   name   !== undefined ? String(name).trim().slice(0, 40)   : req.user.name,
    age:    age    !== undefined ? String(age).trim()                  : req.user.age,
    city:   city   !== undefined ? String(city).trim().slice(0, 60)   : req.user.city,
    bio:    bio    !== undefined ? String(bio).trim().slice(0, 300)   : req.user.bio,
    avatar: avatar !== undefined ? avatar                              : req.user.avatar
  });

  res.json({ ok: true, user: db.publicProfile(updated) });
});

// ── Debug ─────────────────────────────────────────────────
app.get("/debug/env", (_req, res) => {
  res.json({
    hasClientId:     !!CLIENT_ID,
    hasClientSecret: !!CLIENT_SECRET,
    redirectUri:     REDIRECT_URI || null
  });
});

// ── Spotify helpers ───────────────────────────────────────
function spotifyAuthHeader() {
  return "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
}

async function refreshAccessToken(refreshToken) {
  const res = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
    { headers: { Authorization: spotifyAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
  );
  return res.data;
}

async function fetchCurrentTrack(accessToken) {
  return axios.get("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${accessToken}` },
    validateStatus: () => true,
    timeout: 15000
  });
}

// ── GET /spotify/login ────────────────────────────────────
app.get("/spotify/login", (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return res.status(500).send("Не заданы переменные Spotify в .env");
  }
  const scope = [
    "user-read-email", "user-read-private",
    "user-read-currently-playing", "user-read-playback-state"
  ].join(" ");

  res.redirect("https://accounts.spotify.com/authorize?" +
    new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, scope, redirect_uri: REDIRECT_URI }).toString()
  );
});

// ── GET /callback ─────────────────────────────────────────
app.get("/callback", async (req, res) => {
  const { code, error: spotifyError } = req.query;
  if (spotifyError) return res.redirect(`/connect-music?error=${encodeURIComponent(spotifyError)}`);
  if (!code)        return res.redirect("/connect-music?error=no_code");

  try {
    const tokenRes = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({ code, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" }).toString(),
      { headers: { Authorization: spotifyAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
    );

    const { access_token, refresh_token } = tokenRes.data;
    const profile = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` }, timeout: 15000
    });
    const p = profile.data;

    // Если залогинен — сохраняем токены прямо в DB
    if (req.session?.userId) {
      db.updateUser(req.session.userId, {
        spotifyConnected:    true,
        spotifyName:         p.display_name || "",
        spotifyId:           p.id || "",
        spotifyAccessToken:  access_token,
        spotifyRefreshToken: refresh_token || ""
      });
      console.log(`[callback] Spotify saved to DB for user ${req.session.userId}`);
      return res.redirect("/connect-success?" + new URLSearchParams({
        spotifyConnected: "true",
        spotifyName:      p.display_name || ""
      }).toString());
    }

    // Не залогинен — передаём токены через URL (старый flow)
    res.redirect("/connect-success?" + new URLSearchParams({
      spotifyConnected: "true",
      spotifyName:      p.display_name || "",
      spotifyId:        p.id || "",
      accessToken:      access_token,
      refreshToken:     refresh_token || ""
    }).toString());
  } catch (err) {
    console.error("[callback] error:", err.response?.data || err.message);
    res.redirect("/connect-music?error=spotify_callback_failed");
  }
});

app.get("/spotify/callback", (req, res) => {
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.redirect(`/callback${query}`);
});

// ── POST /api/spotify/refresh ─────────────────────────────
app.post("/api/spotify/refresh", requireAuth, async (req, res) => {
  const refreshToken = req.user.spotifyRefreshToken || req.body.refreshToken;
  if (!refreshToken) {
    return res.status(400).json({ ok: false, error: "Нет refreshToken" });
  }
  try {
    const data = await refreshAccessToken(refreshToken);
    db.updateUser(req.user.id, {
      spotifyAccessToken:  data.access_token,
      spotifyRefreshToken: data.refresh_token || refreshToken
    });
    res.json({ ok: true, accessToken: data.access_token, expiresIn: data.expires_in || 3600 });
  } catch (err) {
    console.error("[spotify/refresh] error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ ok: false, error: "Не удалось обновить токен" });
  }
});

// ── GET /api/spotify/current-track ────────────────────────
app.get("/api/spotify/current-track", requireAuth, async (req, res) => {
  let accessToken  = req.user.spotifyAccessToken;
  let refreshToken = req.user.spotifyRefreshToken;

  // Fallback: принимаем токен из query (для обратной совместимости)
  if (!accessToken && req.query.accessToken) {
    accessToken  = req.query.accessToken;
    refreshToken = req.query.refreshToken || refreshToken;
  }

  if (!accessToken) {
    return res.status(400).json({ ok: false, error: "Spotify не подключён" });
  }

  try {
    let trackRes = await fetchCurrentTrack(accessToken);

    // 401 — пробуем обновить токен
    if (trackRes.status === 401 && refreshToken) {
      console.log(`[current-track] 401 → refreshing token for ${req.user.id}`);
      try {
        const refreshData = await refreshAccessToken(refreshToken);
        accessToken = refreshData.access_token;
        db.updateUser(req.user.id, {
          spotifyAccessToken:  accessToken,
          spotifyRefreshToken: refreshData.refresh_token || refreshToken
        });
        trackRes = await fetchCurrentTrack(accessToken);
      } catch (refreshErr) {
        console.error("[current-track] refresh failed:", refreshErr.response?.data || refreshErr.message);
        return res.status(401).json({ ok: false, error: "Сессия Spotify истекла. Переподключи Spotify." });
      }
    } else if (trackRes.status === 401) {
      return res.status(401).json({ ok: false, error: "Токен истёк. Переподключи Spotify." });
    }

    if (trackRes.status === 204) return res.json({ ok: true, isPlaying: false, track: null });
    if (trackRes.status >= 400) {
      return res.status(trackRes.status).json({ ok: false, error: "Ошибка Spotify API" });
    }

    const data = trackRes.data;
    const item = data?.item;
    if (!item) return res.json({ ok: true, isPlaying: false, track: null });

    res.json({
      ok:        true,
      isPlaying: !!data.is_playing,
      track: {
        name:       item.name || "",
        artists:    Array.isArray(item.artists) ? item.artists.map((a) => a.name).join(", ") : "",
        album:      item.album?.name || "",
        image:      item.album?.images?.[0]?.url || "",
        url:        item.external_urls?.spotify || "",
        progressMs: data.progress_ms || 0,
        durationMs: item.duration_ms || 0
      }
    });
  } catch (err) {
    console.error("[current-track] error:", err.response?.data || err.message);
    res.status(500).json({ ok: false, error: "Ошибка при получении трека" });
  }
});

// ── 404 ───────────────────────────────────────────────────
app.use((_req, res) => res.status(404).sendFile(path.join(publicDir, "index.html")));

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`+aura запущен на http://127.0.0.1:${PORT}`));
