require("dotenv").config();

const express = require("express");
const session = require("express-session");
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

app.use(session({
  secret: process.env.SESSION_SECRET || "aura-dev-secret-change-in-prod",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: isProd, sameSite: "lax", maxAge: 7*24*60*60*1000 }
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
  const { name, age, city, bio, avatar, cover, spotifyConnected, spotifyName, spotifyId,
    spotifyAccessToken, spotifyRefreshToken, lastfmUsername, lastfmConnected } = req.body;
  const u = req.user;
  const updated = await db.updateUser(u.id, {
    name:   name   !== undefined ? String(name).trim().slice(0,40)  : u.name,
    age:    age    !== undefined ? String(age).trim()                : u.age,
    city:   city   !== undefined ? String(city).trim().slice(0,60)  : u.city,
    bio:    bio    !== undefined ? String(bio).trim().slice(0,300)  : u.bio,
    avatar: avatar !== undefined ? avatar                            : u.avatar,
    cover:  cover  !== undefined ? cover                             : u.cover,
    ...(spotifyConnected    !== undefined && { spotifyConnected }),
    ...(spotifyName         !== undefined && { spotifyName }),
    ...(spotifyId           !== undefined && { spotifyId }),
    ...(spotifyAccessToken  !== undefined && { spotifyAccessToken }),
    ...(spotifyRefreshToken !== undefined && { spotifyRefreshToken }),
    ...(lastfmUsername      !== undefined && { lastfmUsername: String(lastfmUsername).trim().toLowerCase() }),
    ...(lastfmConnected     !== undefined && { lastfmConnected: !!lastfmConnected }),
  });
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

// ── Radar ──────────────────────────────────────────────────
app.post("/api/now-playing", requireAuth, async (req, res) => {
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
  await db.updateUser(req.user.id, { currentTrack: data });
  res.json({ ok:true });
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
  const existing = db.getSignalsForUser(toId).find(s => s.fromId===req.user.id && s.status==="pending");
  if (existing) return res.status(409).json({ ok:false, error:"Сигнал уже отправлен", signal:existing });
  const signal = db.createSignal({ fromId:req.user.id, toId, type:type||"wave", track:track||"", artist:artist||"", matchType:matchType||"same-vibe" });
  res.json({ ok:true, signal });
});

app.get("/api/signals", requireAuth, async (req, res) => {
  const direction = req.query.direction;
  if (direction === "sent") {
    const rawSigs = db.getSentSignalsForUser(req.user.id);
    const signals = await Promise.all(rawSigs.map(async s => ({
      ...s, to: s.toId ? db.publicProfile(await db.findById(s.toId)) : null
    })));
    return res.json({ ok:true, sentSignals: signals });
  }
  const rawSigs = db.getSignalsForUser(req.user.id);
  const signals = await Promise.all(rawSigs.map(async s => ({
    ...s, from: s.fromId ? db.publicProfile(await db.findById(s.fromId)) : null
  })));
  res.json({ ok:true, signals });
});

app.post("/api/signals/:id/accept", requireAuth, async (req, res) => {
  const signal = db.getSignalById(req.params.id);
  if (!signal) return res.status(404).json({ ok:false, error:"Сигнал не найден" });
  if (signal.toId !== req.user.id) return res.status(403).json({ ok:false, error:"Нет доступа" });
  const updated = db.acceptSignal(req.params.id);
  const from = await db.findById(signal.fromId);
  const emoji = signal.matchType==="same-track" ? "🔴" : signal.matchType==="same-artist" ? "⚪" : "⚫";
  db.sendMessage(updated.chatId, "system", `${emoji} ${from?.name||"Кто-то"} слушал ${signal.artist} — ${signal.track}`);
  res.json({ ok:true, chatId:updated.chatId });
});

app.post("/api/signals/:id/ignore", requireAuth, (req, res) => {
  const signal = db.getSignalById(req.params.id);
  if (!signal) return res.status(404).json({ ok:false, error:"Сигнал не найден" });
  if (signal.toId !== req.user.id) return res.status(403).json({ ok:false, error:"Нет доступа" });
  db.ignoreSignal(req.params.id);
  res.json({ ok:true });
});

// ── Chats ──────────────────────────────────────────────────
app.get("/api/chats", requireAuth, async (req, res) => {
  const rawChats = db.getChatsForUser(req.user.id);
  const chats = await Promise.all(rawChats.map(async chat => {
    const otherId = chat.userIds.find(id => id !== req.user.id);
    const other   = otherId ? await db.findById(otherId) : null;
    const lastMsg = chat.messages[chat.messages.length - 1];
    const unread  = chat.messages.filter(m => m.fromId !== req.user.id && m.fromId !== "system").length;
    return { id:chat.id, other:other ? db.publicProfile(other) : null,
      lastMsg:lastMsg ? { text:lastMsg.text, fromId:lastMsg.fromId, createdAt:lastMsg.createdAt } : null,
      unread, createdAt:chat.createdAt };
  }));
  res.json({ ok:true, chats });
});

app.get("/api/chats/:id/messages", requireAuth, (req, res) => {
  const chat = db.getChatById(req.params.id);
  if (!chat) return res.status(404).json({ ok:false, error:"Чат не найден" });
  if (!chat.userIds.includes(req.user.id)) return res.status(403).json({ ok:false, error:"Нет доступа" });
  res.json({ ok:true, messages:chat.messages });
});

app.post("/api/chats/:id/messages", requireAuth, (req, res) => {
  const chat = db.getChatById(req.params.id);
  if (!chat) return res.status(404).json({ ok:false, error:"Чат не найден" });
  if (!chat.userIds.includes(req.user.id)) return res.status(403).json({ ok:false, error:"Нет доступа" });
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ ok:false, error:"Пустое сообщение" });
  const msg = db.sendMessage(req.params.id, req.user.id, text.trim());
  res.json({ ok:true, message:msg });
});

// ── 404 ───────────────────────────────────────────────────
app.use((_,res) => res.status(404).sendFile(path.join(publicDir,"index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`+aura запущен на http://127.0.0.1:${PORT}`));
