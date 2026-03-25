require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt  = require("bcryptjs");
const axios   = require("axios");
const path    = require("path");
const db      = require("./db");

const app       = express();
const publicDir = path.join(__dirname, "public");

// ── Trust proxy (обязательно для Render/Heroku — иначе сессия не работает) ──
app.set("trust proxy", true);

app.use(express.static(publicDir));
app.use(express.json({ limit: "5mb" }));

const isProd = process.env.NODE_ENV === "production";

app.use(session({
  secret:            process.env.SESSION_SECRET || "aura-dev-secret-change-in-prod",
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   isProd,
    sameSite: "lax",
    maxAge:   7 * 24 * 60 * 60 * 1000
  }
}));

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI  = process.env.SPOTIFY_REDIRECT_URI;

// ── Pages ──────────────────────────────────────────────────
const pages = {
  "/": "index.html", "/login": "login.html", "/signup": "signup.html",
  "/onboarding": "onboarding.html", "/connect-music": "connect-music.html",
  "/connect-success": "connect-success.html", "/home": "home.html",
  "/profile": "profile.html", "/map": "map.html", "/chat": "chat.html"
};
Object.entries(pages).forEach(([r, f]) =>
  app.get(r, (_, res) => res.sendFile(path.join(publicDir, f)))
);

// ── Auth middleware ────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.userId)
    return res.status(401).json({ ok: false, error: "Не авторизован" });
  const user = db.findById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ ok: false, error: "Пользователь не найден" });
  }
  req.user = user;
  next();
}

// ── POST /api/auth/signup ──────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)    return res.status(400).json({ ok: false, error: "Заполни все поля" });
  if (password.length < 6)    return res.status(400).json({ ok: false, error: "Пароль не короче 6 символов" });
  if (db.findByEmail(email))  return res.status(409).json({ ok: false, error: "Почта уже используется" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = db.createUser({ email, passwordHash });
  req.session.userId = user.id;

  // Сохраняем сессию явно перед ответом
  req.session.save(err => {
    if (err) console.error("[signup] session save error:", err);
    res.json({ ok: true, user: db.publicProfile(user), needsOnboarding: true });
  });
});

// ── POST /api/auth/login ───────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, error: "Заполни все поля" });

  const user = db.findByEmail(email);
  if (!user) return res.status(401).json({ ok: false, error: "Неверная почта или пароль" });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ ok: false, error: "Неверная почта или пароль" });

  req.session.userId = user.id;

  req.session.save(err => {
    if (err) console.error("[login] session save error:", err);
    res.json({ ok: true, user: db.publicProfile(user), needsOnboarding: !user.name || !user.city });
  });
});

// ── POST /api/auth/logout ──────────────────────────────────
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── GET /api/auth/me ───────────────────────────────────────
app.get("/api/auth/me", requireAuth, (req, res) =>
  res.json({ ok: true, user: db.publicProfile(req.user) })
);

// ── PATCH /api/profile ─────────────────────────────────────
app.patch("/api/profile", requireAuth, (req, res) => {
  const {
    name, age, city, bio, avatar,
    spotifyConnected, spotifyName, spotifyId,
    spotifyAccessToken, spotifyRefreshToken
  } = req.body;
  const u = req.user;

  const updated = db.updateUser(u.id, {
    name:   name   !== undefined ? String(name).trim().slice(0, 40)  : u.name,
    age:    age    !== undefined ? String(age).trim()                 : u.age,
    city:   city   !== undefined ? String(city).trim().slice(0, 60)  : u.city,
    bio:    bio    !== undefined ? String(bio).trim().slice(0, 300)  : u.bio,
    avatar: avatar !== undefined ? avatar                             : u.avatar,
    ...(spotifyConnected    !== undefined && { spotifyConnected }),
    ...(spotifyName         !== undefined && { spotifyName }),
    ...(spotifyId           !== undefined && { spotifyId }),
    ...(spotifyAccessToken  !== undefined && { spotifyAccessToken }),
    ...(spotifyRefreshToken !== undefined && { spotifyRefreshToken }),
    ...(req.body.lastfmUsername !== undefined && { lastfmUsername: String(req.body.lastfmUsername).trim().toLowerCase() }),
    ...(req.body.lastfmConnected !== undefined && { lastfmConnected: !!req.body.lastfmConnected }),
  });

  res.json({ ok: true, user: db.publicProfile(updated) });
});

// ── Debug ──────────────────────────────────────────────────
app.get("/debug/env", (req, res) => res.json({
  hasClientId:     !!CLIENT_ID,
  hasClientSecret: !!CLIENT_SECRET,
  redirectUri:     REDIRECT_URI || null,
  isProd,
  hasSession:      !!req.session?.userId,
  sessionId:       req.sessionID || null
}));

// ── Spotify helpers ────────────────────────────────────────
const spotifyB64 = () =>
  "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

async function doRefreshToken(rt) {
  const r = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt }).toString(),
    { headers: { Authorization: spotifyB64(), "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
  );
  return r.data;
}

async function fetchTrack(at) {
  return axios.get("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${at}` },
    validateStatus: () => true,
    timeout: 15000
  });
}

// ── GET /spotify/login ─────────────────────────────────────
app.get("/spotify/login", (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI)
    return res.status(500).send("Не заданы переменные Spotify в .env");

  // Если нет сессии — редиректим на логин
  if (!req.session?.userId) {
    return res.redirect("/login");
  }

  // Передаём userId через state — Spotify вернёт его в /callback
  const state = req.session.userId;

  const scope = "user-read-email user-read-private user-read-currently-playing user-read-playback-state";
  res.redirect("https://accounts.spotify.com/authorize?" +
    new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, scope, redirect_uri: REDIRECT_URI, state })
  );
});

// ── GET /callback ──────────────────────────────────────────
app.get("/callback", async (req, res) => {
  const { code, error: err, state } = req.query;
  if (err)   return res.redirect(`/connect-music?error=${encodeURIComponent(err)}`);
  if (!code) return res.redirect("/connect-music?error=no_code");

  try {
    // Обмен code на токены
    const tok = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({ code, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" }).toString(),
      { headers: { Authorization: spotifyB64(), "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
    );
    const { access_token, refresh_token } = tok.data;

    // Получаем профиль Spotify
    const me = (await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` }, timeout: 15000
    })).data;

    // Определяем userId: из сессии или из state (передавали при /spotify/login)
    const userId = req.session?.userId || state;

    if (userId) {
      const updated = db.updateUser(userId, {
        spotifyConnected:    true,
        spotifyName:         me.display_name || "",
        spotifyId:           me.id || "",
        spotifyAccessToken:  access_token,
        spotifyRefreshToken: refresh_token || ""
      });

      if (updated) {
        console.log(`[callback] Spotify linked: ${me.display_name} → user ${userId}`);
        // Восстанавливаем сессию если пропала
        if (!req.session.userId) {
          req.session.userId = userId;
        }
        return req.session.save(() => {
          res.redirect("/connect-success?" + new URLSearchParams({
            spotifyConnected: "true",
            spotifyName: me.display_name || ""
          }));
        });
      }
    }

    // Нет сессии — передаём токены через URL (пользователь не залогинен)
    res.redirect("/connect-success?" + new URLSearchParams({
      spotifyConnected: "true",
      spotifyName:      me.display_name || "",
      spotifyId:        me.id || "",
      accessToken:      access_token,
      refreshToken:     refresh_token || ""
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

// ── POST /api/spotify/refresh ──────────────────────────────
app.post("/api/spotify/refresh", requireAuth, async (req, res) => {
  const rt = req.user.spotifyRefreshToken || req.body.refreshToken;
  if (!rt) return res.status(400).json({ ok: false, error: "Нет refreshToken" });
  try {
    const data = await doRefreshToken(rt);
    db.updateUser(req.user.id, {
      spotifyAccessToken:  data.access_token,
      spotifyRefreshToken: data.refresh_token || rt
    });
    res.json({ ok: true, accessToken: data.access_token, expiresIn: data.expires_in || 3600 });
  } catch (e) {
    console.error("[spotify/refresh]", e.response?.data || e.message);
    res.status(e.response?.status || 500).json({ ok: false, error: "Не удалось обновить токен" });
  }
});

// ── GET /api/spotify/current-track ────────────────────────
app.get("/api/spotify/current-track", requireAuth, async (req, res) => {
  let at = req.user.spotifyAccessToken;
  let rt = req.user.spotifyRefreshToken;

  if (!at) return res.status(400).json({ ok: false, error: "Spotify не подключён" });

  try {
    let r = await fetchTrack(at);

    // 401 — пробуем обновить токен автоматически
    if (r.status === 401 && rt) {
      console.log(`[current-track] refreshing token for ${req.user.id}`);
      try {
        const d = await doRefreshToken(rt);
        at = d.access_token;
        db.updateUser(req.user.id, {
          spotifyAccessToken:  at,
          spotifyRefreshToken: d.refresh_token || rt
        });
        r = await fetchTrack(at);
      } catch (refreshErr) {
        console.error("[current-track] refresh failed:", refreshErr.message);
        return res.status(401).json({ ok: false, error: "Сессия Spotify истекла. Переподключи Spotify." });
      }
    } else if (r.status === 401) {
      return res.status(401).json({ ok: false, error: "Токен истёк. Переподключи Spotify." });
    }

    if (r.status === 204) return res.json({ ok: true, isPlaying: false, track: null });
    if (r.status >= 400)  return res.status(r.status).json({ ok: false, error: "Ошибка Spotify API" });

    const item = r.data?.item;
    if (!item) return res.json({ ok: true, isPlaying: false, track: null });

    res.json({
      ok:        true,
      isPlaying: !!r.data.is_playing,
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


// ── GET /api/lastfm/current-track ──────────────────────────
// Публичный — не требует auth, только lastfmUsername
// Используем один серверный API ключ для всех запросов
app.get("/api/lastfm/current-track", async (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ ok: false, error: "Нет username" });

  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: "Last.fm API ключ не настроен" });

  try {
    const r = await axios.get("https://ws.audioscrobbler.com/2.0/", {
      params: {
        method:  "user.getRecentTracks",
        user:    username,
        api_key: apiKey,
        format:  "json",
        limit:   1,
        extended: 1
      },
      timeout: 10000
    });

    const tracks = r.data?.recenttracks?.track;
    if (!tracks || tracks.length === 0) {
      return res.json({ ok: true, isPlaying: false, track: null });
    }

    // Last.fm возвращает массив или объект если один трек
    const latest = Array.isArray(tracks) ? tracks[0] : tracks;
    const isNowPlaying = latest["@attr"]?.nowplaying === "true";

    // Берём обложку максимального размера
    const images = latest.image || [];
    const image  = images.find(i => i.size === "extralarge")?.["#text"]
                || images.find(i => i.size === "large")?.["#text"]
                || "";

    res.json({
      ok:        true,
      isPlaying: isNowPlaying,
      track: {
        name:    latest.name    || "",
        artists: latest.artist?.name || latest.artist?.["#text"] || "",
        album:   latest.album?.["#text"] || "",
        image:   image.startsWith("https://") ? image : "",
        url:     latest.url || "",
        source:  "lastfm"
      }
    });
  } catch (e) {
    if (e.response?.status === 404) {
      return res.status(404).json({ ok: false, error: "Пользователь Last.fm не найден" });
    }
    console.error("[lastfm/current-track]", e.message);
    res.status(500).json({ ok: false, error: "Ошибка Last.fm API" });
  }
});

// ── 404 ───────────────────────────────────────────────────
app.use((_, res) => res.status(404).sendFile(path.join(publicDir, "index.html")));

// ── Start ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`+aura запущен на http://127.0.0.1:${PORT}`));
