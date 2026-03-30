require("dotenv").config();

const express = require("express");
const session   = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const bcrypt  = require("bcryptjs");
const axios   = require("axios");
const path    = require("path");
const db      = require("./db");

const app       = express();
const publicDir = path.join(__dirname, "public");

app.set("trust proxy", true);
app.use(express.static(publicDir));
app.use(express.json({ limit: "5mb" }));

const isProd = process.env.NODE_ENV === "production";

// PostgreSQL persistent sessions — переживают рестарт
const pgPool = db.pgPool();
app.use(session({
  store: pgPool ? new PgSession({ pool: pgPool, tableName: "sessions", createTableIfMissing: true }) : undefined,
  secret: process.env.SESSION_SECRET || "aura-dev-secret-change-in-prod",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: isProd, sameSite: "lax", maxAge: 30*24*60*60*1000 }
}));

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI  = process.env.SPOTIFY_REDIRECT_URI;

// ── Pages ──────────────────────────────────────────────────
const pages = {
  "/":"index.html", "/login":"login.html", "/signup":"signup.html",
  "/onboarding":"onboarding.html", "/connect-music":"connect-music.html",
  "/connect-success":"connect-success.html", "/home":"home.html",
  "/profile":"profile.html", "/map":"map.html", "/chat":"chat.html"
};
Object.entries(pages).forEach(([r,f]) => app.get(r, (_,res) => res.sendFile(path.join(publicDir,f))));

// Публичный профиль /u/:name → user-profile.html
app.get("/u/:name", (req, res) => res.sendFile(path.join(publicDir, "user-profile.html")));

// API: получить публичный профиль по имени или id
app.get("/api/user/:nameOrId", async (req, res) => {
  const param = req.params.nameOrId;
  let user = await db.findById(param).catch(() => null);
  if (!user) {
    // Ищем по имени (case-insensitive)
    const all = await db.getAllUsers?.() || [];
    user = all.find(u => u.name?.toLowerCase() === param.toLowerCase());
  }
  if (!user) return res.status(404).json({ ok: false, error: "Пользователь не найден" });
  res.json({ ok: true, user: db.publicProfile(user) });
});

// ── Auth middleware ────────────────────────────────────────
async function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ ok:false, error:"Не авторизован" });
  try {
    const user = await db.findById(req.session.userId);
    if (!user) { req.session.destroy(()=>{}); return res.status(401).json({ ok:false, error:"Пользователь не найден" }); }
    req.user = user; next();
  } catch(e) { res.status(500).json({ ok:false, error:"DB error" }); }
}

// ── Auth API ───────────────────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)   return res.status(400).json({ ok:false, error:"Заполни все поля" });
  if (password.length < 6)   return res.status(400).json({ ok:false, error:"Пароль не короче 6 символов" });
  if (await db.findByEmail(email)) return res.status(409).json({ ok:false, error:"Почта уже используется" });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.createUser({ email, passwordHash });
  req.session.userId = user.id;
  req.session.save(err => {
    if (err) console.error("[signup] session save error:", err);
    res.json({ ok:true, user:db.publicProfile(user), needsOnboarding:true });
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ ok:false, error:"Заполни все поля" });
  const user = await db.findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ ok:false, error:"Неверная почта или пароль" });
  req.session.userId = user.id;
  req.session.save(err => {
    if (err) console.error("[login] session save error:", err);
    res.json({ ok:true, user:db.publicProfile(user), needsOnboarding:!user.name||!user.city });
  });
});

app.post("/api/auth/logout", (req, res) => { req.session.destroy(() => res.json({ ok:true })); });
app.get("/api/auth/me", requireAuth, (req, res) => res.json({ ok:true, user:db.publicProfile(req.user) }));

// ── Profile API ────────────────────────────────────────────
app.patch("/api/profile", requireAuth, async (req, res) => {
  const { name, age, city, bio, avatar, cover, photos, username,
    spotifyConnected, spotifyName, spotifyId,
    spotifyAccessToken, spotifyRefreshToken, lastfmUsername, lastfmConnected } = req.body;
  const u = req.user;

  // Проверка уникальности username
  if (username !== undefined) {
    const clean = String(username).toLowerCase().replace(/[^a-z0-9_.]/g,'').slice(0,24);
    if (clean.length >= 3) {
      const pool = db.pgPool();
      if (pool) {
        const exists = await pool.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [clean, u.id]);
        if (exists.rows.length > 0) return res.status(409).json({ ok:false, error:'Юзернейм занят' });
      }
    }
  }

  const patch = {};
  if (name    !== undefined) patch.name    = String(name).trim().slice(0,40);
  if (age     !== undefined) patch.age     = String(age).trim();
  if (city    !== undefined) patch.city    = String(city).trim().slice(0,60);
  if (bio     !== undefined) patch.bio     = String(bio).trim().slice(0,300);
  if (avatar  !== undefined) patch.avatar  = avatar;
  if (cover   !== undefined) patch.cover   = cover;
  if (photos  !== undefined) patch.photos  = photos;
  if (username !== undefined) patch.username = String(username).toLowerCase().replace(/[^a-z0-9_.]/g,'').slice(0,24);
  if (spotifyConnected    !== undefined) patch.spotifyConnected    = spotifyConnected;
  if (spotifyName         !== undefined) patch.spotifyName         = spotifyName;
  if (spotifyId           !== undefined) patch.spotifyId           = spotifyId;
  if (spotifyAccessToken  !== undefined) patch.spotifyAccessToken  = spotifyAccessToken;
  if (spotifyRefreshToken !== undefined) patch.spotifyRefreshToken = spotifyRefreshToken;
  if (lastfmUsername      !== undefined) patch.lastfmUsername      = String(lastfmUsername).trim().toLowerCase();
  if (lastfmConnected     !== undefined) patch.lastfmConnected     = !!lastfmConnected;

  const updated = await db.updateUser(u.id, patch);
  res.json({ ok:true, user:db.publicProfile(updated) });
});

// ── Debug ──────────────────────────────────────────────────
app.get("/debug/env", (req, res) => res.json({
  hasClientId:!!CLIENT_ID, hasClientSecret:!!CLIENT_SECRET, redirectUri:REDIRECT_URI||null,
  isProd, hasSession:!!req.session?.userId, sessionId: req.sessionID
}));

// Диагностика текущего пользователя
app.get("/debug/me", requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id, name: u.name, email: u.email,
    spotifyConnected: u.spotifyConnected, spotifyName: u.spotifyName,
    hasSpotifyToken: !!u.spotifyAccessToken,
    lastfmConnected: u.lastfmConnected, lastfmUsername: u.lastfmUsername,
  });
});

// Показывает всех кто сейчас на радаре (для отладки)
app.get("/debug/radar", requireAuth, async (req, res) => {
  const all = await db.getAllNowPlaying();
  res.json({ ok: true, count: all.length, users: all.map(u => ({
    userId: u.userId, name: u.name,
    track: u.track, artist: u.artist,
    lat: u.lat, lng: u.lng,
    hasGeo: !!(u.lat && u.lng),
    ageSeconds: Math.round((Date.now() - u.updatedAt) / 1000),
  }))});
});

// ── Spotify helpers ────────────────────────────────────────
const spotifyB64 = () => "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

async function doRefreshToken(rt) {
  const r = await axios.post("https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type:"refresh_token", refresh_token:rt }).toString(),
    { headers:{ Authorization:spotifyB64(), "Content-Type":"application/x-www-form-urlencoded" }, timeout:15000 });
  return r.data;
}

async function fetchTrack(at) {
  return axios.get("https://api.spotify.com/v1/me/player/currently-playing",
    { headers:{ Authorization:`Bearer ${at}` }, validateStatus:()=>true, timeout:15000 });
}

app.get("/spotify/login", (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI)
    return res.status(500).send("Не заданы переменные Spotify в .env");
  // state содержит userId если залогинен, иначе пустой
  const state = req.session?.userId || "";
  console.log("[spotify/login] session userId:", req.session?.userId || "none");
  const scope = "user-read-email user-read-private user-read-currently-playing user-read-playback-state";
  res.redirect("https://accounts.spotify.com/authorize?" +
    new URLSearchParams({ response_type:"code", client_id:CLIENT_ID, scope, redirect_uri:REDIRECT_URI, state }));
});

app.get("/callback", async (req, res) => {
  const { code, error:err, state } = req.query;
  if (err)   return res.redirect(`/connect-music?error=${encodeURIComponent(err)}`);
  if (!code) return res.redirect("/connect-music?error=no_code");
  try {
    const tok = await axios.post("https://accounts.spotify.com/api/token",
      new URLSearchParams({ code, redirect_uri:REDIRECT_URI, grant_type:"authorization_code" }).toString(),
      { headers:{ Authorization:spotifyB64(), "Content-Type":"application/x-www-form-urlencoded" }, timeout:15000 });
    const { access_token, refresh_token } = tok.data;
    const me = (await axios.get("https://api.spotify.com/v1/me",
      { headers:{ Authorization:`Bearer ${access_token}` }, timeout:15000 })).data;
    const userId = req.session?.userId || state;
    if (userId) {
      await db.updateUser(userId, { spotifyConnected:true, spotifyName:me.display_name||"",
        spotifyId:me.id||"", spotifyAccessToken:access_token, spotifyRefreshToken:refresh_token||"" });
      console.log(`[callback] Spotify linked: ${me.display_name} → ${userId}`);
      if (!req.session.userId) req.session.userId = userId;
      return req.session.save(() => res.redirect("/connect-success?" +
        new URLSearchParams({ spotifyConnected:"true", spotifyName:me.display_name||"" })));
    }
    res.redirect("/connect-success?" + new URLSearchParams({
      spotifyConnected:"true", spotifyName:me.display_name||"",
      spotifyId:me.id||"", accessToken:access_token, refreshToken:refresh_token||""
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
  if (!rt) return res.status(400).json({ ok:false, error:"Нет refreshToken" });
  try {
    const data = await doRefreshToken(rt);
    await db.updateUser(req.user.id, { spotifyAccessToken:data.access_token, spotifyRefreshToken:data.refresh_token||rt });
    res.json({ ok:true, accessToken:data.access_token, expiresIn:data.expires_in||3600 });
  } catch (e) {
    res.status(e.response?.status||500).json({ ok:false, error:"Не удалось обновить токен" });
  }
});

app.get("/api/spotify/current-track", requireAuth, async (req, res) => {
  let at = req.user.spotifyAccessToken, rt = req.user.spotifyRefreshToken;
  if (!at) return res.status(400).json({ ok:false, error:"Spotify не подключён" });
  try {
    let r = await fetchTrack(at);
    if (r.status === 401 && rt) {
      try {
        const d = await doRefreshToken(rt); at = d.access_token;
        await db.updateUser(req.user.id, { spotifyAccessToken:at, spotifyRefreshToken:d.refresh_token||rt });
        r = await fetchTrack(at);
      } catch { return res.status(401).json({ ok:false, error:"Сессия Spotify истекла." }); }
    } else if (r.status === 401) return res.status(401).json({ ok:false, error:"Токен истёк." });
    if (r.status === 204) return res.json({ ok:true, isPlaying:false, track:null });
    if (r.status >= 400)  return res.status(r.status).json({ ok:false, error:"Ошибка Spotify API" });
    const item = r.data?.item;
    if (!item) return res.json({ ok:true, isPlaying:false, track:null });
    res.json({ ok:true, isPlaying:!!r.data.is_playing, track:{
      name: item.name||"", artists: item.artists?.map(a=>a.name).join(", ")||"",
      album: item.album?.name||"", image: item.album?.images?.[0]?.url||"",
      url: item.external_urls?.spotify||"", progressMs: r.data.progress_ms||0, durationMs: item.duration_ms||0
    }});
  } catch (e) { res.status(500).json({ ok:false, error:"Ошибка при получении трека" }); }
});

// ── Last.fm ────────────────────────────────────────────────
app.get("/api/lastfm/current-track", async (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ ok:false, error:"Нет username" });
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return res.status(500).json({ ok:false, error:"Last.fm API ключ не настроен" });
  try {
    const r = await axios.get("https://ws.audioscrobbler.com/2.0/", {
      params:{ method:"user.getRecentTracks", user:username, api_key:apiKey, format:"json", limit:1, extended:1 },
      timeout:10000
    });
    const tracks = r.data?.recenttracks?.track;
    if (!tracks || tracks.length === 0) return res.json({ ok:true, isPlaying:false, track:null });
    const latest = Array.isArray(tracks) ? tracks[0] : tracks;
    const isNowPlaying = latest["@attr"]?.nowplaying === "true";
    const images = latest.image || [];
    const image  = images.find(i=>i.size==="extralarge")?.["#text"] || images.find(i=>i.size==="large")?.["#text"] || "";
    res.json({ ok:true, isPlaying:isNowPlaying, track:{
      name: latest.name||"", artists: latest.artist?.name||latest.artist?.["#text"]||"",
      album: latest.album?.["#text"]||"", image: image.startsWith("https://") ? image : "",
      url: latest.url||"", source:"lastfm"
    }});
  } catch (e) {
    if (e.response?.status === 404) return res.status(404).json({ ok:false, error:"Пользователь Last.fm не найден" });
    res.status(500).json({ ok:false, error:"Ошибка Last.fm API" });
  }
});

// Last.fm обложка для конкретного трека + MusicBrainz fallback
app.get("/api/lastfm/cover", async (req, res) => {
  const { track, artist } = req.query;
  if (!track || !artist) return res.json({ ok: false, image: "" });
  const apiKey = process.env.LASTFM_API_KEY;
  const placeholder = "2a96cbd8b46e442fc41c2b86b821562f";

  // Попытка 1 — Last.fm track.getInfo
  try {
    if (apiKey) {
      const r = await axios.get("https://ws.audioscrobbler.com/2.0/", {
        params: { method: "track.getInfo", track, artist, api_key: apiKey, format: "json" },
        timeout: 3000
      });
      const images = r.data?.track?.album?.image || [];
      const img = images.find(i => i.size === "extralarge")?.["#text"]
               || images.find(i => i.size === "large")?.["#text"] || "";
      if (img && !img.includes(placeholder)) {
        return res.json({ ok: true, image: img });
      }
    }
  } catch(_) {}

  // Попытка 2 — MusicBrainz Cover Art Archive
  try {
    const mbSearch = await axios.get(
      `https://musicbrainz.org/ws/2/recording/?query=recording:"${encodeURIComponent(track)}" AND artist:"${encodeURIComponent(artist)}"&limit=1&fmt=json`,
      { headers: { "User-Agent": "aura-app/1.0 (aura-red.onrender.com)" }, timeout: 4000 }
    );
    const releaseId = mbSearch.data?.recordings?.[0]?.releases?.[0]?.id;
    if (releaseId) {
      const coverR = await axios.get(
        `https://coverartarchive.org/release/${releaseId}`,
        { timeout: 3000 }
      );
      const img = coverR.data?.images?.[0]?.thumbnails?.["500"] || coverR.data?.images?.[0]?.image || "";
      if (img) return res.json({ ok: true, image: img });
    }
  } catch(_) {}

  res.json({ ok: false, image: "" });
});


app.get("/api/lastfm/search", async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.json({ ok: true, tracks: [] });
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return res.json({ ok: true, tracks: [] });
  try {
    const r = await axios.get("https://ws.audioscrobbler.com/2.0/", {
      params: { method: "track.search", track: q, api_key: apiKey, format: "json", limit: 8 }
    });
    const raw = r.data?.results?.trackmatches?.track || [];
    const tracks = (Array.isArray(raw) ? raw : [raw]).map(t => {
      // Last.fm возвращает обложки треков — берём наибольший размер
      const images = Array.isArray(t.image) ? t.image : [];
      const img = images.find(i => i.size === "extralarge")?.["#text"]
               || images.find(i => i.size === "large")?.["#text"]
               || images.find(i => i.size === "medium")?.["#text"]
               || "";
      return {
        name:   t.name   || "",
        artist: t.artist || "",
        image:  (img && !img.includes("2a96cbd8b46e442fc41c2b86b821562f")) ? img : "",
        url:    t.url    || "",
        album:  "",
      };
    }).filter(t => t.name && t.artist && t.artist !== "(null)");
    res.json({ ok: true, tracks });
  } catch(e) {
    res.json({ ok: true, tracks: [] });
  }
});


app.get("/api/yandex/current-track", requireAuth, async (req, res) => {
  try {
    const user = await db.findById(req.user.id);
    const token = user?.yandexToken;
    if (!token) return res.json({ ok: false, error: "Яндекс Музыка не подключена" });

    // Получаем список очередей — первая = текущая
    const queuesResp = await axios.get("https://api.music.yandex.net/queues", {
      headers: { "Authorization": `OAuth ${token}`, "X-Yandex-Music-Client": "WindowsPhone/3.20" }
    });

    const queues = queuesResp.data?.result?.queues;
    if (!queues?.length) return res.json({ ok: true, isPlaying: false });

    // Берём последнюю активную очередь
    const queueId = queues[0].id;
    const queueResp = await axios.get(`https://api.music.yandex.net/queues/${queueId}`, {
      headers: { "Authorization": `OAuth ${token}`, "X-Yandex-Music-Client": "WindowsPhone/3.20" }
    });

    const queue = queueResp.data?.result;
    if (!queue) return res.json({ ok: true, isPlaying: false });

    const currentIdx = queue.currentIndex ?? 0;
    const trackId = queue.tracks?.[currentIdx]?.id;
    if (!trackId) return res.json({ ok: true, isPlaying: false });

    // Получаем инфу о треке
    const trackResp = await axios.get(`https://api.music.yandex.net/tracks/${trackId}`, {
      headers: { "Authorization": `OAuth ${token}`, "X-Yandex-Music-Client": "WindowsPhone/3.20" }
    });

    const track = trackResp.data?.result?.[0];
    if (!track) return res.json({ ok: true, isPlaying: false });

    const artists = (track.artists || []).map(a => a.name).join(", ");
    const album   = track.albums?.[0];
    const image   = album?.coverUri
      ? "https://" + album.coverUri.replace("%%", "400x400")
      : "";

    res.json({ ok: true, isPlaying: true, track: {
      name: track.title || "",
      artists: artists,
      album: album?.title || "",
      image,
      url: `https://music.yandex.ru/track/${trackId}`,
      source: "yandex"
    }});
  } catch(e) {
    const status = e.response?.status;
    if (status === 401) return res.json({ ok: false, error: "Токен недействителен" });
    console.error("[yandex]", e.message);
    res.json({ ok: false, error: "Ошибка Яндекс Музыки" });
  }
});

// Сохранить токен Яндекс Музыки
app.post("/api/yandex/connect", requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token?.trim()) return res.status(400).json({ ok: false, error: "Нет токена" });
  try {
    // Проверяем токен
    await axios.get("https://api.music.yandex.net/account/status", {
      headers: { "Authorization": `OAuth ${token.trim()}`, "X-Yandex-Music-Client": "WindowsPhone/3.20" }
    });
    await db.updateUser(req.user.id, { yandexToken: token.trim() });
    res.json({ ok: true });
  } catch(e) {
    res.status(400).json({ ok: false, error: "Токен недействителен — попробуй другой способ получения" });
  }
});

app.post("/api/yandex/disconnect", requireAuth, async (req, res) => {
  await db.updateUser(req.user.id, { yandexToken: "" });
  res.json({ ok: true });
});


app.post("/api/now-playing", requireAuth, async (req, res) => {
  try {
  const { track, artist, album, image, url, source, lat, lng } = req.body;
  if (!track || !artist) return res.status(400).json({ ok:false, error:"Нужны track и artist" });
  const data = {
    track:  String(track).slice(0,200),  artist: String(artist).slice(0,200),
    album:  String(album||"").slice(0,200), image: String(image||"").slice(0,500),
    url:    String(url||"").slice(0,500),   source: String(source||"").slice(0,50),
    lat:    lat ? parseFloat(lat) : null,   lng: lng ? parseFloat(lng) : null,
  };
  if (data.lat !== null && (isNaN(data.lat)||data.lat<-90 ||data.lat>90))  data.lat=null;
  if (data.lng !== null && (isNaN(data.lng)||data.lng<-180||data.lng>180)) data.lng=null;
  db.setNowPlaying(req.user.id, data);

  // +1 аура за активность (не чаще раза в 10 мин)
  const lastPush = db.getMyNowPlaying(req.user.id);
  const tenMin = 10 * 60 * 1000;
  if (!lastPush || Date.now() - (lastPush.updatedAt || 0) > tenMin) {
    const u = await db.findById(req.user.id);
    if (u) await db.updateUser(req.user.id, { auraPoints: (u.auraPoints || 0) + 1 });
  }

  // Обновляем текущий трек и историю треков (последние 10)
  const user = await db.findById(req.user.id);
  const history = Array.isArray(user?.trackHistory) ? user.trackHistory : [];
  const entry = { track: data.track, artist: data.artist, image: data.image, ts: Date.now() };
  // Не дублируем если тот же трек что и последний
  const last = history[0];
  const newHistory = (last?.track === entry.track && last?.artist === entry.artist)
    ? history
    : [entry, ...history].slice(0, 10);

  // Обновляем стрик
  const today = new Date().toISOString().slice(0,10);
  const lastDay = user?.streakLast ? String(user.streakLast).slice(0,10) : null;
  let newStreak = user?.streakDays || 0;
  if (lastDay !== today) {
    const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
    newStreak = lastDay === yesterday ? newStreak + 1 : 1;
  }
  await db.updateUser(req.user.id, { currentTrack: data, trackHistory: newHistory, streakDays: newStreak, streakLast: today });
  res.json({ ok:true, streak: newStreak });
  } catch(e) { console.error("[now-playing]", e.message); res.status(500).json({ ok:false, error: e.message }); }
});

app.get("/api/radar/nearby", requireAuth, async (req, res) => {
  const lat    = parseFloat(req.query.lat);
  const lng    = parseFloat(req.query.lng);
  const radius = Math.min(parseFloat(req.query.radius)||50, 100);
  if (isNaN(lat)||isNaN(lng)) return res.status(400).json({ ok:false, error:"Нужны lat и lng" });
  const nearby = await db.getNearbyUsers(lat, lng, radius, req.user.id);

  // Берём мой трек из радара (свежее) или из базы (fallback)
  const myRadar  = db.getMyNowPlaying(req.user.id);
  const myTrack  = myRadar || (await db.findById(req.user.id))?.currentTrack;
  const myName   = myTrack?.track?.toLowerCase().trim()  || "";
  const myArtist = myTrack?.artist?.toLowerCase().trim() || "";

  function artistMatch(a, b) {
    if (!a || !b) return false;
    // Совпадение если один содержит другого (для "Artist A, Artist B")
    return a === b || a.includes(b) || b.includes(a);
  }

  const users = nearby.map(u => {
    const uTrack  = u.track?.toLowerCase().trim()  || "";
    const uArtist = u.artist?.toLowerCase().trim() || "";
    const matchType =
      myName   && uTrack  && myName === uTrack          ? "same-track"  :
      myArtist && uArtist && artistMatch(myArtist, uArtist) ? "same-artist" : "same-vibe";
    return { ...u, matchType };
  });

  res.json({ ok:true, count:users.length, users,
    stats:{ sameTrack:users.filter(u=>u.matchType==="same-track").length,
            sameArtist:users.filter(u=>u.matchType==="same-artist").length,
            sameVibe:users.filter(u=>u.matchType==="same-vibe").length }});
});

// ── Signals ────────────────────────────────────────────────
app.post("/api/signals", requireAuth, async (req, res) => {
  const { toId, type, track, artist, matchType } = req.body;
  if (!toId) return res.status(400).json({ ok:false, error:"Нет toId" });
  if (!await db.findById(toId)) return res.status(404).json({ ok:false, error:"Пользователь не найден" });
  if (toId === req.user.id) return res.status(400).json({ ok:false, error:"Нельзя отправить себе" });
  const existing = (await db.getSignalsForUser(toId)).find(s => s.fromId===req.user.id && s.status==="pending");
  if (existing) return res.status(409).json({ ok:false, error:"Сигнал уже отправлен", signal:existing });
  const signal = await db.createSignal({ fromId:req.user.id, toId, type:type||"wave", track:track||"", artist:artist||"", matchType:matchType||"same-vibe" });
  res.json({ ok:true, signal });
});

app.get("/api/signals", requireAuth, async (req, res) => {
  const direction = req.query.direction;
  if (direction === "sent") {
    const rawSigs = await db.getSentSignalsForUser(req.user.id);
    const signals = await Promise.all(rawSigs.map(async s => ({
      ...s, to: s.toId ? db.publicProfile(await db.findById(s.toId)) : null
    })));
    return res.json({ ok:true, sentSignals: signals });
  }
  const rawSigs = await db.getSignalsForUser(req.user.id);
  const signals = await Promise.all(rawSigs.map(async s => ({
    ...s, from: s.fromId ? db.publicProfile(await db.findById(s.fromId)) : null
  })));
  res.json({ ok:true, signals });
});

app.post("/api/signals/:id/accept", requireAuth, async (req, res) => {
  try {
  const signal = await db.getSignalById(req.params.id);
  if (!signal) return res.status(404).json({ ok:false, error:"Сигнал не найден" });
  if (signal.toId !== req.user.id) return res.status(403).json({ ok:false, error:"Нет доступа" });
  const updated = await db.acceptSignal(req.params.id);
  const from = await db.findById(signal.fromId);
  const emoji = signal.matchType==="same-track" ? "🔴" : signal.matchType==="same-artist" ? "⚪" : "⚫";
  await db.sendMessage(updated.chatId, "system", `${emoji} ${from?.name||"Кто-то"} слушал ${signal.artist} — ${signal.track}`);
  // +5 ауры отправителю за принятый сигнал
  const fromUser = await db.findById(signal.fromId);
  if (fromUser) await db.updateUser(signal.fromId, { auraPoints: (fromUser.auraPoints || 0) + 5 });
  res.json({ ok:true, chatId:updated.chatId });
  } catch(e) { console.error("[accept-signal]", e.message); res.status(500).json({ ok:false, error: e.message }); }
});

app.post("/api/signals/:id/ignore", requireAuth, async (req, res) => {
  const signal = await db.getSignalById(req.params.id);
  if (!signal) return res.status(404).json({ ok:false, error:"Сигнал не найден" });
  if (signal.toId !== req.user.id) return res.status(403).json({ ok:false, error:"Нет доступа" });
  await db.ignoreSignal(req.params.id);
  res.json({ ok:true });
});

// ── Notifications: принятые сигналы ───────────────────────
app.get("/api/notifications", requireAuth, async (req, res) => {
  // Сигналы которые Я отправил и они были приняты
  const sent = await db.getSentSignalsForUser(req.user.id);
  const accepted = sent.filter(s => s.status === "accepted" && !s.seenByFrom);
  const result = await Promise.all(accepted.map(async s => ({
    ...s,
    to: s.toId ? db.publicProfile(await db.findById(s.toId)) : null
  })));
  res.json({ ok: true, notifications: result });
});

app.post("/api/notifications/seen", requireAuth, async (req, res) => {
  // Помечаем все принятые сигналы как просмотренные
  await db.markSignalsSeenByFrom(req.user.id);
  res.json({ ok: true });
});

app.get("/api/unread", requireAuth, async (req, res) => {
  try {
  const [rawChats, rawSignals, sentSignals] = await Promise.all([
    db.getChatsForUser(req.user.id),
    db.getSignalsForUser(req.user.id),
    db.getSentSignalsForUser(req.user.id),
  ]);
  const pendingSignals  = rawSignals.filter(s => s.status === "pending").length;
  const unseenAccepted  = sentSignals.filter(s => s.status === "accepted" && !s.seenByFrom).length;
  let unreadMessages = 0;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // последние 24 часа
  for (const chat of rawChats) {
    const msgs = chat.messages || [];
    // Находим последнее моё сообщение
    let lastMyTs = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].fromId === req.user.id) { lastMyTs = msgs[i].createdAt || 0; break; }
    }
    // Новые = чужие сообщения после моего последнего И за последние 24ч
    const newMsgs = msgs.filter(m =>
      m.fromId !== req.user.id &&
      m.fromId !== "system" &&
      (m.createdAt || 0) > lastMyTs &&
      (m.createdAt || 0) > cutoff
    );
    if (newMsgs.length > 0) unreadMessages++;
  }
  const total = unreadMessages + pendingSignals + unseenAccepted;
  res.json({ ok:true, total, unreadMessages, pendingSignals, unseenAccepted });
  } catch(e) { console.error("[unread]", e.message); res.json({ ok:true, total:0, unreadMessages:0, pendingSignals:0, unseenAccepted:0 }); }
});

app.get("/api/chats", requireAuth, async (req, res) => {
  try {
    const rawChats = await db.getChatsForUser(req.user.id);
    const chats = await Promise.all(rawChats.map(async chat => {
      const otherId = (chat.userIds || []).find(id => id !== req.user.id);
      const other   = otherId ? await db.findById(otherId) : null;
      const msgs    = chat.messages || [];
      const lastMsg = msgs[msgs.length - 1];
      const unread  = msgs.filter(m => m.fromId !== req.user.id && m.fromId !== "system").length;
      return { id:chat.id, other:other ? db.publicProfile(other) : null,
        lastMsg:lastMsg ? { text:lastMsg.text, fromId:lastMsg.fromId, createdAt:lastMsg.createdAt } : null,
        unread, createdAt:chat.createdAt };
    }));
    res.json({ ok:true, chats });
  } catch(e) {
    console.error("[chats]", e.message);
    res.json({ ok:true, chats:[] });
  }
});

app.get("/api/chats/:id/messages", requireAuth, async (req, res) => {
  try {
    const chat = await db.getChatById(req.params.id);
    if (!chat) return res.status(404).json({ ok:false, error:"Чат не найден" });
    if (!(chat.userIds || []).includes(req.user.id)) return res.status(403).json({ ok:false, error:"Нет доступа" });
    res.json({ ok:true, messages: chat.messages || [] });
  } catch(e) {
    console.error("[messages]", e.message);
    res.status(500).json({ ok:false, error:"Ошибка загрузки сообщений" });
  }
});

app.post("/api/chats/:id/messages", requireAuth, async (req, res) => {
  const chat = await db.getChatById(req.params.id);
  if (!chat) return res.status(404).json({ ok:false, error:"Чат не найден" });
  if (!(chat.userIds || []).includes(req.user.id)) return res.status(403).json({ ok:false, error:"Нет доступа" });
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ ok:false, error:"Пустое сообщение" });
  const msg = await db.sendMessage(req.params.id, req.user.id, text.trim());
  res.json({ ok:true, message:msg });
});

// ── Ping (keep-alive) ──────────────────────────────────────
app.get("/ping", (req, res) => res.json({ ok: true, ts: Date.now() }));

// Само-пинг каждые 10 минут чтобы Render не засыпал
if (process.env.RENDER_EXTERNAL_URL) {
  const selfUrl = process.env.RENDER_EXTERNAL_URL + "/ping";
  setInterval(async () => {
    try {
      await axios.get(selfUrl, { timeout: 10000 });
      console.log("[keep-alive] ping ok");
    } catch (e) {
      console.warn("[keep-alive] ping failed:", e.message);
    }
  }, 10 * 60 * 1000); // каждые 10 минут
}

// ── 404 ───────────────────────────────────────────────────
app.use((_,res) => res.status(404).sendFile(path.join(publicDir,"index.html")));

// ── Global error handler ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[server error]", err.message);
  res.status(500).json({ ok: false, error: "Внутренняя ошибка сервера" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`+aura запущен на http://127.0.0.1:${PORT}`));

// ── Username ──────────────────────────────────────────────
app.post("/api/username/check", requireAuth, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false });
  const clean = username.toLowerCase().replace(/[^a-z0-9_.]/g, '');
  if (clean.length < 3) return res.json({ ok: false, error: "Минимум 3 символа" });
  if (clean.length > 24) return res.json({ ok: false, error: "Максимум 24 символа" });
  try {
    const pool = db.pgPool();
    if (!pool) return res.json({ ok: true, available: true });
    const r = await pool.query(
      `SELECT id FROM users WHERE username = $1 AND id != $2`,
      [clean, req.user.id]
    );
    res.json({ ok: true, available: r.rows.length === 0, username: clean });
  } catch(e) { res.status(500).json({ ok: false }); }
});

// ── Reactions ──────────────────────────────────────────────
app.post("/api/reactions", requireAuth, async (req, res) => {
  const { toId, track, artist, emoji } = req.body;
  if (!toId || !emoji) return res.status(400).json({ ok: false });
  try {
    const pool = db.pgPool();
    if (pool) {
      const id = 'rxn_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
      await pool.query(
        `INSERT INTO reactions(id,from_id,to_id,track,artist,emoji,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [id, req.user.id, toId, track||'', artist||'', emoji, Date.now()]
      );
    }
    res.json({ ok: true });
  } catch(e) { console.error('[reactions]', e.message); res.status(500).json({ ok: false }); }
});

app.get("/api/reactions", requireAuth, async (req, res) => {
  try {
    const pool = db.pgPool();
    if (!pool) return res.json({ ok: true, reactions: [] });
    const r = await pool.query(
      `SELECT rx.*, u.name as from_name, u.avatar as from_avatar
       FROM reactions rx JOIN users u ON u.id = rx.from_id
       WHERE rx.to_id = $1 AND rx.created_at > $2
       ORDER BY rx.created_at DESC LIMIT 20`,
      [req.user.id, Date.now() - 7*24*60*60*1000]
    );
    res.json({ ok: true, reactions: r.rows.map(r => ({
      id: r.id, fromId: r.from_id, fromName: r.from_name, fromAvatar: r.from_avatar,
      track: r.track, artist: r.artist, emoji: r.emoji, createdAt: Number(r.created_at)
    }))});
  } catch(e) { res.json({ ok: true, reactions: [] }); }
});

// ── Referral ───────────────────────────────────────────────
app.post("/api/referral/use", requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ ok: false });
  try {
    const all = await db.getAllUsers();
    const referrer = all.find(u => u.name?.toLowerCase() === code.trim().toLowerCase() && u.id !== req.user.id);
    if (!referrer) return res.status(404).json({ ok: false, error: "Пользователь не найден" });
    const me = await db.findById(req.user.id);
    await Promise.all([
      db.updateUser(req.user.id, { auraPoints: (me?.auraPoints || 0) + 50 }),
      db.updateUser(referrer.id, { auraPoints: (referrer.auraPoints || 0) + 50 }),
    ]);
    res.json({ ok: true, referrerName: referrer.name });
  } catch(e) { res.status(500).json({ ok: false }); }
});

// ── Weekly recap ───────────────────────────────────────────
app.get("/api/weekly-recap", requireAuth, async (req, res) => {
  try {
    const user = await db.findById(req.user.id);
    const history = user?.trackHistory || [];
    const weekAgo = Date.now() - 7*24*60*60*1000;
    const week = history.filter(t => (t.ts||0) > weekAgo);
    const artistCount = {}, trackCount = {};
    week.forEach(t => {
      if (t.artist) artistCount[t.artist] = (artistCount[t.artist]||0) + 1;
      const key = (t.track||'') + '::' + (t.artist||'');
      if (!trackCount[key]) trackCount[key] = { track: t.track, artist: t.artist, image: t.image||'', count: 0 };
      trackCount[key].count++;
    });
    res.json({ ok: true, recap: {
      totalTracks: week.length,
      topArtists: Object.entries(artistCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>({name,count})),
      topTracks:  Object.values(trackCount).sort((a,b)=>b.count-a.count).slice(0,5),
      streak: user?.streakDays || 0
    }});
  } catch(e) { res.status(500).json({ ok: false }); }
});
