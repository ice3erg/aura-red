require("dotenv").config();

const express = require("express");
const session   = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const bcrypt  = require("bcryptjs");
const axios   = require("axios");
const WebSocket = require("ws");

// ── Ynison — real-time трек с Яндекс Музыки через WebSocket ─────────────────
async function ynisonGetTrack(token) {
  // Ynison требует Sec-WebSocket-Protocol: Bearer, v2, {json}
  // Библиотека ws валидирует протоколы и не принимает JSON со спецсимволами.
  // Обходим через низкоуровневый HTTP upgrade с ручным заголовком.
  const https = require("https");
  const crypto = require("crypto");

  return new Promise((resolve) => {
    const deviceId = crypto.randomBytes(16).toString("hex");
    const timer = setTimeout(() => { resolve(null); }, 10000);
    const done = (v) => { clearTimeout(timer); resolve(v); };

    function makeProto(extra = {}) {
      const obj = {
        "Ynison-Device-Id": deviceId,
        "Ynison-Device-Info": JSON.stringify({ app_name: "Desktop", app_version: "5.79.7", type: 1 }),
        "authorization": "OAuth " + token,
        ...extra
      };
      return "Bearer, v2, " + JSON.stringify(obj);
    }

    function ynisonConnect(hostname, path, proto, onOpen, onMessage, onError) {
      const key = crypto.randomBytes(16).toString("base64");
      const req = https.request({
        hostname,
        path,
        port: 443,
        method: "GET",
        headers: {
          "Connection": "Upgrade",
          "Upgrade": "websocket",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": key,
          "Sec-WebSocket-Protocol": proto,
          "Origin": "https://music.yandex.ru",
          "Authorization": "OAuth " + token,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        rejectUnauthorized: false,
      });

      req.on("error", (e) => onError(e.message));
      req.on("upgrade", (res, socket) => {
        // Читаем WebSocket фреймы вручную
        let buf = Buffer.alloc(0);

        socket.on("error", (e) => onError(e.message));
        socket.on("close", () => console.log("[ynison] socket closed"));
        socket.on("end",   () => console.log("[ynison] socket end"));

        // Определяем send ДО onOpen чтобы он был доступен в колбэке
        socket.send = (text) => {
          const payload = Buffer.from(text, "utf8");
          const len = payload.length;
          let header;
          if (len < 126) header = Buffer.from([0x81, len]);
          else if (len < 65536) { header = Buffer.alloc(4); header[0]=0x81; header[1]=126; header.writeUInt16BE(len,2); }
          else { header = Buffer.alloc(10); header[0]=0x81; header[1]=127; header.writeBigUInt64BE(BigInt(len),2); }
          socket.write(Buffer.concat([header, payload]));
        };

        if (onOpen) onOpen(socket);
        socket.on("data", (chunk) => {
          console.log("[ynison] raw data bytes:", chunk.length, "first bytes:", chunk.slice(0,4).toString("hex"));
          buf = Buffer.concat([buf, chunk]);
          // Парсим WebSocket frame
          while (buf.length >= 2) {
            const fin    = (buf[0] & 0x80) !== 0;
            const opcode = buf[0] & 0x0f;
            const masked = (buf[1] & 0x80) !== 0;
            let payLen = buf[1] & 0x7f;
            let offset = 2;
            if (payLen === 126) { if (buf.length < 4) break; payLen = buf.readUInt16BE(2); offset = 4; }
            else if (payLen === 127) { if (buf.length < 10) break; payLen = Number(buf.readBigUInt64BE(2)); offset = 10; }
            if (buf.length < offset + (masked ? 4 : 0) + payLen) break;
            let mask, data;
            if (masked) { mask = buf.slice(offset, offset + 4); offset += 4; data = buf.slice(offset, offset + payLen); for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4]; }
            else { data = buf.slice(offset, offset + payLen); }
            buf = buf.slice(offset + payLen);
            console.log("[ynison] frame opcode:", opcode, "len:", payLen);
            if (opcode === 1 || opcode === 2) { // text or binary
              const text = data.toString("utf8");
              console.log("[ynison] message:", text.slice(0, 300));
              onMessage(text, socket);
            } else if (opcode === 8) { // close
              const code = payLen >= 2 ? data.readUInt16BE(0) : 1000;
              const reason = payLen > 2 ? data.slice(2).toString("utf8") : "";
              console.log("[ynison] close frame code:", code, "reason:", reason);
              socket.destroy();
            } else if (opcode === 9) { // ping
              // отвечаем pong
              socket.write(Buffer.from([0x8a, 0x00]));
            }
          }
        });

      });

      req.end();
    }

    // ШАГ 1: редиректор (не нужен onOpen)
    ynisonConnect(
      "ynison.music.yandex.ru",
      "/redirector.YnisonRedirectService/GetRedirectToYnison",
      makeProto(),
      null,
      (msg, sock) => {
        sock.destroy();
        let redirect;
        try { redirect = JSON.parse(msg); } catch { return done(null); }
        if (redirect.error) { console.error("[ynison] rdr error response:", JSON.stringify(redirect.error)); return done(null); }

        const host   = (redirect.host || "").replace(/^wss?:\/\//, "").replace(/\/$/, "");
        const ticket = redirect.redirect_ticket;
        const sid    = redirect.session_id;
        if (!host || !ticket) { console.error("[ynison] no host/ticket"); return done(null); }
        console.log("[ynison] redirect to:", host);

        // ШАГ 2: state socket
        const stateExtra = { "Ynison-Redirect-Ticket": ticket };
        if (sid) stateExtra["Ynison-Session-Id"] = sid;

        ynisonConnect(
          host,
          "/ynison_state.YnisonStateService/PutYnisonState",
          makeProto(stateExtra),
          (sock2) => {
            console.log("[ynison] state socket open, sending init");
            const nowMs = Date.now();
            const ver = { device_id: deviceId, version: "0", timestamp_ms: nowMs };
            // Точный формат из Python реализации (exclude_none=True)
            sock2.send(JSON.stringify({
              rid: require("crypto").randomUUID(),
              activity_interception_type: "DO_NOT_INTERCEPT_BY_DEFAULT",
              player_action_timestamp_ms: nowMs,
              update_full_state: {
                player_state: {
                  player_queue: {
                    current_playable_index: -1,
                    entity_type: "VARIOUS",
                    entity_context: "BASED_ON_ENTITY_BY_DEFAULT",
                    options: { repeat_mode: "NONE" },
                    playable_list: [],
                    version: ver
                  },
                  status: {
                    duration_ms: 0,
                    paused: true,
                    playback_speed: 1.0,
                    progress_ms: 0,
                    version: ver
                  }
                },
                device: {
                  info: { device_id: deviceId, type: "WEB", title: "Deck Player", app_name: "Desktop", app_version: "5.79.7" },
                  capabilities: { can_be_player: true, can_be_remote_controller: true, volume_granularity: 16 },
                  volume_info: { volume: 0.0 },
                  is_shadow: true
                },
                is_currently_active: false
              }
            }));
            console.log("[ynison] init sent");
          },
          async (msg2, sock2) => {
            // Получаем каждое сообщение — ищем update_full_state с треком
            let state;
            try { state = JSON.parse(msg2); } catch(e) { console.error("[ynison] state parse error:", e.message); return; }
            console.log("[ynison] state keys:", Object.keys(state));

            const fs  = state.update_full_state || state;
            const pq  = fs?.player_state?.player_queue;
            const st  = fs?.player_state?.status;

            if (!pq?.playable_list?.length) { console.log("[ynison] empty queue, waiting..."); return; }

            const idx  = pq.current_playable_index ?? 0;
            const item = pq.playable_list[idx];
            const tid  = item?.playable_id;
            if (!tid) { console.log("[ynison] no track id"); return; }

            console.log("[ynison] track:", tid, "paused:", st?.paused);
            sock2.destroy(); // закрываем только когда нашли трек

            try {
              const r = await axios.get("https://api.music.yandex.net/tracks/" + tid, {
                headers: { "Authorization": "OAuth " + token, "X-Yandex-Music-Client": "YandexMusicAndroid/24023621" },
                timeout: 5000
              });
              const t = r.data?.result?.[0];
              if (!t) return done(null);
              const album = t.albums?.[0];
              const result = {
                name:      t.title || item.title || "",
                artists:   (t.artists || []).map(a => a.name).join(", "),
                album:     album?.title || "",
                image:     album?.coverUri ? "https://" + album.coverUri.replace("%%", "400x400") : "",
                url:       "https://music.yandex.ru/track/" + tid,
                source:    "yandex",
                isPlaying: !st?.paused,
              };
              console.log("[ynison] ok:", result.name, "-", result.artists);
              done(result);
            } catch(e) { console.error("[ynison] track fetch:", e.message); done(null); }
          },
          (e) => { console.error("[ynison] state error:", e); done(null); }
        );

      },
      (e) => { console.error("[ynison] rdr error:", e); done(null); }
    );
  });
}
// ── END Ynison ───────────────────────────────────────────────────────────────

const path    = require("path");
const db      = require("./db");
const { ACHIEVEMENTS, getTitle, checkAchievements } = require("./achievements");

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
  "/":"index.html", "/login":"login.html", "/signup":"signup.html", "/aura":"aura.html", "/friends":"friends.html",
  "/onboarding":"onboarding.html", "/connect-music":"connect-music.html",
  "/connect-success":"connect-success.html", "/home":"home.html",
  "/profile":"profile.html", "/map":"map.html", "/chat":"chat.html", "/get-ym-token":"get-ym-token.html"
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
  isProd, hasSession:!!req.session?.userId, sessionId: req.sessionID,
  version: "2026-03-30-v2", usernameRoute: true, reactionsRoute: true
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

// Last.fm sync — импортируем последние треки в trackHistory
app.post("/api/lastfm/sync", requireAuth, async (req, res) => {
  try {
    const user = await db.findById(req.user.id);
    const username = user?.lastfmUsername;
    if (!username) return res.status(400).json({ ok: false, error: "Last.fm не подключён" });

    const apiKey = process.env.LASTFM_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: "Нет ключа Last.fm" });

    const r = await axios.get("https://ws.audioscrobbler.com/2.0/", {
      params: { method: "user.getRecentTracks", user: username, api_key: apiKey, format: "json", limit: 50 },
      timeout: 10000
    });

    const raw = r.data?.recenttracks?.track || [];
    const tracks = Array.isArray(raw) ? raw : [raw];
    const placeholder = "2a96cbd8b46e442fc41c2b86b821562f";

    const newEntries = tracks
      .filter(t => t.name && (t.artist?.name || t.artist?.["#text"]))
      .map(t => {
        const images = t.image || [];
        const img = images.find(i => i.size === "extralarge")?.[["#text"]] ||
                    images.find(i => i.size === "large")?.[["#text"]] || "";
        return {
          track:  t.name || "",
          artist: t.artist?.name || t.artist?.["#text"] || "",
          album:  t.album?.["#text"] || "",
          image:  (img && img.startsWith("https://") && !img.includes(placeholder)) ? img : "",
          ts:     t.date?.uts ? Number(t.date.uts) * 1000 : Date.now(),
          source: "lastfm"
        };
      });

    if (!newEntries.length) return res.json({ ok: true, synced: 0 });

    // Мёрджим с текущей историей — убираем дубли по track+artist
    const existing = Array.isArray(user.trackHistory) ? user.trackHistory : [];
    const existingKeys = new Set(existing.map(t => t.track + "::" + t.artist));
    const toAdd = newEntries.filter(t => !existingKeys.has(t.track + "::" + t.artist));

    const merged = [...toAdd, ...existing]
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 200); // храним до 200 треков

    await db.updateUser(req.user.id, { trackHistory: merged });
    res.json({ ok: true, synced: toAdd.length, total: merged.length });
  } catch(e) {
    console.error("[lastfm/sync]", e.message);
    res.status(500).json({ ok: false, error: "Ошибка Last.fm" });
  }
});

// Фото артиста — Deezer (без ключа) с fallback на MusicBrainz
app.get("/api/lastfm/artist-image", async (req, res) => {
  const { artist } = req.query;
  if (!artist) return res.json({ ok: false, image: "" });
  try {
    // Deezer Search API — бесплатно, без ключа
    const r = await axios.get("https://api.deezer.com/search/artist", {
      params: { q: artist, limit: 3 },
      timeout: 5000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AuraApp/1.0)" }
    });
    const results = r.data?.data || [];
    // Ищем точное совпадение или берём первый
    const match = results.find(a => a.name.toLowerCase() === artist.toLowerCase()) || results[0];
    const img = match?.picture_xl || match?.picture_big || match?.picture_medium || "";
    return res.json({ ok: true, image: img });
  } catch(e) {
    // Fallback: MusicBrainz cover art
    try {
      const mb = await axios.get("https://musicbrainz.org/ws/2/artist/", {
        params: { query: artist, limit: 1, fmt: "json" },
        headers: { "User-Agent": "AuraApp/1.0 (contact@aura.app)" },
        timeout: 4000
      });
      const mbid = mb.data?.artists?.[0]?.id;
      if (mbid) {
        const fa = await axios.get(`https://coverartarchive.org/release-group/${mbid}`, { timeout: 3000 }).catch(()=>null);
        const img = fa?.data?.images?.[0]?.thumbnails?.large || "";
        return res.json({ ok: true, image: img });
      }
    } catch(_) {}
    res.json({ ok: false, image: "" });
  }
});

// Last.fm — определяем жанры пользователя по топ трекам
app.post("/api/lastfm/genres", requireAuth, async (req, res) => {
  try {
    const user = await db.findById(req.user.id);
    const history = user?.trackHistory || [];
    if (!history.length) return res.json({ ok: true, genres: [] });

    const apiKey = process.env.LASTFM_API_KEY;

    // Берём топ-5 артистов
    const artistCount = {};
    for (const t of history) {
      if (t.artist) artistCount[t.artist] = (artistCount[t.artist]||0) + 1;
    }
    const topArtists = Object.entries(artistCount)
      .sort((a,b) => b[1]-a[1]).slice(0,5).map(([a]) => a);

    // Получаем теги для каждого артиста через Last.fm
    const tagCount = {};
    const SKIP = new Set(['seen live','under 2000 listeners','all','favorites','spotify','love','awesome','good','music','listened to']);

    await Promise.allSettled(topArtists.map(async artist => {
      try {
        const r = await axios.get('https://ws.audioscrobbler.com/2.0/', {
          params: { method: 'artist.getTopTags', artist, api_key: apiKey, format: 'json' },
          timeout: 4000
        });
        const tags = r.data?.toptags?.tag || [];
        for (const tag of tags.slice(0,5)) {
          const name = (tag.name||'').toLowerCase().trim();
          if (name.length > 1 && name.length < 30 && !SKIP.has(name) && parseInt(tag.count||0) > 10) {
            tagCount[name] = (tagCount[name]||0) + parseInt(tag.count||0);
          }
        }
      } catch(_) {}
    }));

    const genres = Object.entries(tagCount)
      .sort((a,b) => b[1]-a[1]).slice(0,8).map(([g]) => g);

    // Сохраняем жанры в профиль
    if (genres.length) await db.updateUser(user.id, { genres });

    res.json({ ok: true, genres });
  } catch(e) {
    console.error('[genres]', e.message);
    res.json({ ok: true, genres: [] });
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

    const track = await ynisonGetTrack(token);
    if (!track) return res.json({ ok: true, isPlaying: false });

    res.json({ ok: true, isPlaying: track.isPlaying !== false, track });
  } catch(e) {
    console.error("[ynison]", e.message);
    res.json({ ok: false, error: "Ошибка Яндекс Музыки" });
  }
});

// Сохранить токен Яндекс Музыки
// Получить токен ЯМ по логину/паролю (двухшаговый OAuth)

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
  // Загружаем пользователя и читаем lastPush ДО setNowPlaying
  const user = await db.findById(req.user.id);
  const lastPush = db.getMyNowPlaying(req.user.id); // читаем ДО обновления!
  
  db.setNowPlaying(req.user.id, data); // теперь обновляем

  const history = Array.isArray(user?.trackHistory) ? user.trackHistory : [];
  const entry = { track: data.track, artist: data.artist, image: data.image, ts: Date.now() };
  const last = history[0];
  const newHistory = (last?.track === entry.track && last?.artist === entry.artist)
    ? history : [entry, ...history].slice(0, 200);

  // Стрик
  const today = new Date().toISOString().slice(0,10);
  const lastDay = user?.streakLast ? String(user.streakLast).slice(0,10) : null;
  let newStreak = user?.streakDays || 0;
  if (lastDay !== today) {
    const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
    newStreak = lastDay === yesterday ? newStreak + 1 : 1;
  }

  // Считаем все бонусы за один раз
  let auraGain = 0;
  let streakBonus = 0;

  // +1 за публикацию (раз в 10 мин)
  const tenMin = 10 * 60 * 1000;
  if (!lastPush || Date.now() - (lastPush.updatedAt || 0) > tenMin) {
    auraGain += 1;
  }

  // Стрик-бонус
  if (lastDay !== today) {
    if (newStreak === 7)               { streakBonus = 15; auraGain += 15; }
    else if (newStreak === 30)         { streakBonus = 50; auraGain += 50; }
    else if (newStreak % 7 === 0)      { streakBonus = 10; auraGain += 10; }
  }

  console.log(`[now-playing] user=${req.user.id} auraGain=${auraGain} currentPts=${user.auraPoints} lastPush=${lastPush?.updatedAt} streakBonus=${streakBonus}`);
  // Одно обновление — все поля сразу
  const updatedUser = await db.updateUser(req.user.id, {
    currentTrack: data, trackHistory: newHistory,
    streakDays: newStreak, streakLast: today,
    auraPoints: (user.auraPoints || 0) + auraGain,
  });

  // Проверяем новые достижения (безопасно — колонка может не существовать)
  let newAchs = [];
  try {
    newAchs = checkAchievements(updatedUser);
    if (newAchs.length) {
      const allAchs = [...(updatedUser.achievements || []), ...newAchs];
      const achBonus = newAchs.reduce((sum, a) => {
        const def = ACHIEVEMENTS.find(x => x.id === a.id);
        return sum + (def?.aura || 0);
      }, 0);
      await db.updateUser(req.user.id, {
        achievements: allAchs,
        auraPoints: (updatedUser.auraPoints || 0) + achBonus,
      });
    }
  } catch(achErr) { console.warn('[achievements] skipped:', achErr.message); }

  res.json({ ok:true, streak: newStreak, streakBonus, newAchievements: newAchs });
  } catch(e) { console.error("[now-playing]", e.message); res.status(500).json({ ok:false, error: e.message }); }
});

app.get("/api/radar/nearby", requireAuth, async (req, res) => {
  const lat    = parseFloat(req.query.lat);
  const lng    = parseFloat(req.query.lng);
  const radius = Math.min(parseFloat(req.query.radius)||50, 100);
  if (isNaN(lat)||isNaN(lng)) return res.status(400).json({ ok:false, error:"Нужны lat и lng" });
  const nearby = await db.getNearbyUsers(lat, lng, radius, req.user.id);
  
  // Добавляем друзей — они всегда видны на карте
  try {
    const pool = db.pgPool();
    if (pool) {
      const friendRows = await pool.query(
        `SELECT f.friend_id FROM friends f WHERE f.user_id=$1 AND f.status='accepted'`,
        [req.user.id]
      );
      for (const row of friendRows.rows) {
        const fid = row.friend_id;
        if (nearby.find(u => u.userId === fid)) continue; // уже есть
        const fNowPlaying = db.getMyNowPlaying(fid);
        if (!fNowPlaying) continue; // не на карте
        const fu = await db.findById(fid);
        if (!fu) continue;
        nearby.push({
          userId: fid, name: fu.name||'', avatar: fu.avatar||null,
          track: fNowPlaying.track||'', artist: fNowPlaying.artist||'',
          image: fNowPlaying.image||'', source: fNowPlaying.source||'',
          lat: fNowPlaying.lat||lat, lng: fNowPlaying.lng||lng,
          distKm: null, isFriend: true, auraPoints: fu.auraPoints||0,
          genres: fu.genres||[]
        });
      }
    }
  } catch(_) {}

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

  // Мои жанры
  const meUser   = await db.findById(req.user.id);
  const myGenres = new Set((meUser?.genres||[]).map(g => g.toLowerCase()));

  const users = nearby.map(u => {
    const uTrack  = u.track?.toLowerCase().trim()  || "";
    const uArtist = u.artist?.toLowerCase().trim() || "";
    const uGenres = (u.genres||[]).map(g => g.toLowerCase());
    const commonGenres = uGenres.filter(g => myGenres.has(g));

    const matchType =
      myName   && uTrack  && myName === uTrack              ? "same-track"  :
      myArtist && uArtist && artistMatch(myArtist, uArtist) ? "same-artist" :
      commonGenres.length >= 2                               ? "same-genre"  : "same-vibe";

    return { ...u, matchType, commonGenres };
  });

  res.json({ ok:true, count:users.length, users,
    stats:{ sameTrack:users.filter(u=>u.matchType==="same-track").length,
            sameArtist:users.filter(u=>u.matchType==="same-artist").length,
            sameGenre:users.filter(u=>u.matchType==="same-genre").length,
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

  // Считаем совпадение вкусов
  const toUser   = await db.findById(signal.toId);
  const fromUser = await db.findById(signal.fromId);
  let tasteBonus = 0;
  if (fromUser && toUser) {
    const h1 = (fromUser.trackHistory||[]).map(t=>t.artist?.toLowerCase()).filter(Boolean);
    const h2 = (toUser.trackHistory||[]).map(t=>t.artist?.toLowerCase()).filter(Boolean);
    if (h1.length && h2.length) {
      const s1 = new Set(h1), s2 = new Set(h2);
      const common = [...s1].filter(a => s2.has(a)).length;
      const total  = new Set([...s1,...s2]).size;
      const pct    = total > 0 ? Math.round(common/total*100) : 0;
      // Бонус за совпадение вкусов
      tasteBonus = pct >= 70 ? 30 : pct >= 40 ? 20 : pct >= 15 ? 10 : 5;
    }
  }

  // +10 базовых + taste bonus обоим
  const totalBonus = 10 + tasteBonus;
  if (fromUser) {
    const newAchs = checkAchievements({...fromUser, auraPoints:(fromUser.auraPoints||0)+totalBonus});
    await db.updateUser(signal.fromId, {
      auraPoints: (fromUser.auraPoints||0) + totalBonus,
      achievements: [...(fromUser.achievements||[]), ...newAchs]
    });
  }
  if (toUser) {
    const newAchs = checkAchievements({...toUser, auraPoints:(toUser.auraPoints||0)+totalBonus});
    await db.updateUser(signal.toId, {
      auraPoints: (toUser.auraPoints||0) + totalBonus,
      achievements: [...(toUser.achievements||[]), ...newAchs]
    });
  }

  res.json({ ok:true, chatId:updated.chatId, tasteBonus, totalBonus });
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
  const pool = db.pgPool();
  const [rawChats, rawSignals, sentSignals] = await Promise.all([
    db.getChatsForUser(req.user.id),
    db.getSignalsForUser(req.user.id),
    db.getSentSignalsForUser(req.user.id),
  ]);
  const pendingSignals  = rawSignals.filter(s => s.status === "pending").length;
  const unseenAccepted  = sentSignals.filter(s => s.status === "accepted" && !s.seenByFrom).length;

  // Получаем когда последний раз читал каждый чат
  let readMap = {};
  if (pool) {
    try {
      const rr = await pool.query(`SELECT chat_id, read_at FROM chat_reads WHERE user_id=$1`, [req.user.id]);
      for (const row of rr.rows) readMap[row.chat_id] = Number(row.read_at);
    } catch(_) {}
  }

  let unreadMessages = 0;
  for (const chat of rawChats) {
    const msgs = chat.messages || [];
    const lastRead = readMap[chat.id] || 0;
    // Находим последнее моё сообщение
    let lastMyTs = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].fromId === req.user.id) { lastMyTs = msgs[i].createdAt || 0; break; }
    }
    // Непрочитанные: чужие сообщения после последнего прочтения ИЛИ после моего последнего
    const seenTs = Math.max(lastRead, lastMyTs);
    const hasUnread = msgs.some(m =>
      m.fromId !== req.user.id &&
      m.fromId !== "system" &&
      (m.createdAt || 0) > seenTs
    );
    if (hasUnread) unreadMessages++;
  }
  const total = unreadMessages + pendingSignals + unseenAccepted;
  res.json({ ok:true, total, unreadMessages, pendingSignals, unseenAccepted });
  } catch(e) { console.error("[unread]", e.message); res.json({ ok:true, total:0, unreadMessages:0, pendingSignals:0, unseenAccepted:0 }); }
});

// Отмечаем чат прочитанным
app.post("/api/chats/:id/read", requireAuth, async (req, res) => {
  const pool = db.pgPool();
  if (!pool) return res.json({ ok: false });
  try {
    await pool.query(
      `INSERT INTO chat_reads(user_id, chat_id, read_at) VALUES($1,$2,$3)
       ON CONFLICT(user_id,chat_id) DO UPDATE SET read_at=$3`,
      [req.user.id, req.params.id, Date.now()]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false }); }
});

app.get("/api/chats", requireAuth, async (req, res) => {
  try {
    const rawChats = await db.getChatsForUser(req.user.id);
    const pool = db.pgPool();

    // Читаем когда последний раз открывал каждый чат
    let readMap = {};
    if (pool) {
      try {
        const rr = await pool.query(`SELECT chat_id, read_at FROM chat_reads WHERE user_id=$1`, [req.user.id]);
        for (const row of rr.rows) readMap[row.chat_id] = Number(row.read_at);
      } catch(_) {}
    }

    const chats = await Promise.all(rawChats.map(async chat => {
      const otherId = (chat.userIds || []).find(id => id !== req.user.id);
      const other   = otherId ? await db.findById(otherId) : null;
      const msgs    = chat.messages || [];
      const lastMsg = msgs[msgs.length - 1];

      // Последнее моё сообщение
      let lastMyTs = 0;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].fromId === req.user.id) { lastMyTs = msgs[i].createdAt || 0; break; }
      }
      const seenTs = Math.max(readMap[chat.id] || 0, lastMyTs);
      const unread = msgs.filter(m =>
        m.fromId !== req.user.id &&
        m.fromId !== "system" &&
        (m.createdAt || 0) > seenTs
      ).length;

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
app.get("/ping", (req, res) => res.json({ ok: true, ts: Date.now(), v: "2026-04-01-v4", routes: ["username","reactions","achievements","challenges"] }));

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

// ── Friends ───────────────────────────────────────────────
app.post("/api/friends/add", requireAuth, async (req, res) => {
  const { toId } = req.body;
  if (!toId) return res.status(400).json({ ok:false });
  const pool = db.pgPool();
  if (!pool) return res.json({ ok:false, error:"БД недоступна" });
  try {
    const id = 'fr_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    await pool.query(
      `INSERT INTO friends(id,user_id,friend_id,status,created_at) VALUES($1,$2,$3,'accepted',$4) ON CONFLICT(user_id,friend_id) DO NOTHING`,
      [id, req.user.id, toId, Date.now()]
    );
    // Взаимная дружба
    const id2 = 'fr_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    await pool.query(
      `INSERT INTO friends(id,user_id,friend_id,status,created_at) VALUES($1,$2,$3,'accepted',$4) ON CONFLICT(user_id,friend_id) DO NOTHING`,
      [id2, toId, req.user.id, Date.now()]
    );
    res.json({ ok:true });
  } catch(e) { console.error('[friends/add]', e.message); res.status(500).json({ ok:false }); }
});

app.post("/api/friends/remove", requireAuth, async (req, res) => {
  const { toId } = req.body;
  const pool = db.pgPool();
  if (!pool) return res.json({ ok:false });
  try {
    await pool.query(`DELETE FROM friends WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)`, [req.user.id, toId]);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false }); }
});

app.get("/api/friends", requireAuth, async (req, res) => {
  const pool = db.pgPool();
  if (!pool) return res.json({ ok:true, friends:[] });
  try {
    const r = await pool.query(
      `SELECT f.friend_id, u.name, u.avatar, u.current_track, u.aura_points, u.username
       FROM friends f JOIN users u ON u.id=f.friend_id
       WHERE f.user_id=$1 AND f.status='accepted'
       ORDER BY u.updated_at DESC NULLS LAST`,
      [req.user.id]
    );
    res.json({ ok:true, friends: r.rows.map(row => ({
      id: row.friend_id, name: row.name, avatar: row.avatar,
      currentTrack: row.current_track,
      auraPoints: row.aura_points,
      username: row.username,
    }))});
  } catch(e) { res.status(500).json({ ok:true, friends:[] }); }
});

app.get("/api/friends/check/:userId", requireAuth, async (req, res) => {
  const pool = db.pgPool();
  if (!pool) return res.json({ isFriend: false });
  try {
    const r = await pool.query(
      `SELECT 1 FROM friends WHERE user_id=$1 AND friend_id=$2 AND status='accepted'`,
      [req.user.id, req.params.userId]
    );
    res.json({ isFriend: r.rows.length > 0 });
  } catch(e) { res.json({ isFriend: false }); }
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
    // +5 ауры тому кто получил реакцию
    const recipient = await db.findById(toId);
    if (recipient) {
      await db.updateUser(toId, { auraPoints: (recipient.auraPoints || 0) + 5 });
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

// ── Achievements ──────────────────────────────────────────
app.get("/api/achievements", requireAuth, async (req, res) => {
  try {
    let user = await db.findById(req.user.id);
    if (!user) return res.json({ ok: true, achievements: [], title: '' });

    // Обогащаем user статистикой сигналов для проверки ачивок
    try {
      const pool = db.pgPool();
      if (pool) {
        const [sent, accepted] = await Promise.all([
          pool.query(`SELECT COUNT(*)::int as n FROM signals WHERE from_id=$1`, [user.id]).catch(()=>({rows:[{n:0}]})),
          pool.query(`SELECT COUNT(*)::int as n FROM signals WHERE to_id=$1 AND status='accepted'`, [user.id]).catch(()=>({rows:[{n:0}]})),
        ]);
        user = { ...user, signalsSent: sent.rows[0]?.n||0, signalsAccepted: accepted.rows[0]?.n||0 };
      }
    } catch(_) {}

    // Проверяем и выдаём новые достижения прямо здесь
    const newOnes = checkAchievements(user);
    if (newOnes.length > 0) {
      const achBonus = newOnes.reduce((s, a) => {
        const def = ACHIEVEMENTS.find(x => x.id === a.id);
        return s + (def?.aura || 0);
      }, 0);
      user = await db.updateUser(user.id, {
        achievements: [...(user.achievements || []), ...newOnes],
        auraPoints: (user.auraPoints || 0) + achBonus,
      });
    }

    const earned = user?.achievements || [];
    const earnedIds = new Set(earned.map(a => a.id));
    const all = ACHIEVEMENTS.map(a => ({
      id: a.id, emoji: a.emoji, name: a.name, desc: a.desc, aura: a.aura,
      earned: earnedIds.has(a.id),
      earnedAt: earned.find(e => e.id === a.id)?.ts || null,
    }));
    const title = getTitle(user?.auraPoints || 0);
    res.json({ ok: true, achievements: all, title, newUnlocked: newOnes.length, auraPoints: user.auraPoints || 0 });
  } catch(e) {
    console.error('[achievements]', e.message);
    res.json({ ok: true, achievements: [], title: '' });
  }
});

// ── Weekly Challenges ─────────────────────────────────────
// ── Недельные челленджи (встроено) ────────────────────────
const CHALLENGE_POOL = [
  { id:'streak_3',      emoji:'🔥', name:'Не пропускай',       desc:'Публикуй трек 3 дня подряд',   aura:30, check:(u,w)=>(u.streakDays||0)>=3 },
  { id:'tracks_5',      emoji:'🎵', name:'Активный слушатель', desc:'Опубликуй 5 треков за неделю', aura:25, check:(u,w)=>w.tracksThisWeek>=5 },
  { id:'react_3',       emoji:'❤️', name:'Реагируй',           desc:'Отправь 3 реакции за неделю',  aura:20, check:(u,w)=>w.reactionsGiven>=3 },
  { id:'signal_1',      emoji:'📡', name:'Выйди на связь',     desc:'Отправь сигнал кому-нибудь',   aura:25, check:(u,w)=>w.signalsSent>=1 },
  { id:'new_artist',    emoji:'🎸', name:'Новый вайб',         desc:'Послушай 3 разных артиста',    aura:20, check:(u,w)=>w.uniqueArtists>=3 },
  { id:'morning_track', emoji:'☀️', name:'С добрым утром',     desc:'Опубликуй трек до 10:00',      aura:20, check:(u,w)=>w.morningTrack },
  { id:'late_night',    emoji:'🌙', name:'Ночной слушатель',   desc:'Опубликуй трек после 23:00',   aura:20, check:(u,w)=>w.lateNightTrack },
  { id:'react_back',    emoji:'🤝', name:'Взаимность',         desc:'Получи реакцию в ответ',       aura:25, check:(u,w)=>w.reactionsReceived>=1 },
];
function getWeeklyChallenges() {
  const weekNum = Math.floor(Date.now()/(7*24*60*60*1000));
  let s = (weekNum*2654435761)>>>0;
  const idx=[];
  while(idx.length<3){s=((s*1664525+1013904223)>>>0);const i=s%CHALLENGE_POOL.length;if(!idx.includes(i))idx.push(i);}
  return idx.map(i=>CHALLENGE_POOL[i]);
}
function getChallengeProgress(id,w){
  const m={streak_3:{cur:Math.min(w.streakDays||0,3),max:3},tracks_5:{cur:Math.min(w.tracksThisWeek||0,5),max:5},react_3:{cur:Math.min(w.reactionsGiven||0,3),max:3},signal_1:{cur:Math.min(w.signalsSent||0,1),max:1},new_artist:{cur:Math.min(w.uniqueArtists||0,3),max:3},morning_track:{cur:w.morningTrack?1:0,max:1},late_night:{cur:w.lateNightTrack?1:0,max:1},react_back:{cur:Math.min(w.reactionsReceived||0,1),max:1}};
  return m[id]||{cur:0,max:1};
}

app.get("/api/challenges", requireAuth, async (req, res) => {
  try {
    const user = await db.findById(req.user.id);
    if (!user) return res.status(401).json({ ok: false });

    // Статистика за неделю из trackHistory
    const weekStart = new Date();
    weekStart.setHours(0,0,0,0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay()+6)%7)); // Пн
    const weekStartTs = weekStart.getTime();

    const history = (user.trackHistory||[]).filter(t => (t.ts||0) >= weekStartTs);
    const weekStats = {
      tracksThisWeek:    history.length,
      uniqueArtists:     new Set(history.map(t=>t.artist).filter(Boolean)).size,
      morningTrack:      history.some(t => { const h=new Date(t.ts||0).getHours(); return h>=5&&h<10; }),
      lateNightTrack:    history.some(t => new Date(t.ts||0).getHours()>=23),
      reactionsGiven:    0,
      reactionsReceived: 0,
      signalsSent:       0,
      streakDays:        user.streakDays || 0,
    };

    // Пробуем получить статистику из БД — но не падаем если не получается
    try {
      const pool = db.pgPool();
      if (pool) {
        const rxG = await pool.query(`SELECT COUNT(*)::int as n FROM reactions WHERE from_id=$1 AND created_at>$2`, [user.id, weekStartTs]).catch(()=>({rows:[{n:0}]}));
        const rxR = await pool.query(`SELECT COUNT(*)::int as n FROM reactions WHERE to_id=$1 AND created_at>$2`,   [user.id, weekStartTs]).catch(()=>({rows:[{n:0}]}));
        const sgs = await pool.query(`SELECT COUNT(*)::int as n FROM signals  WHERE from_id=$1 AND created_at>$2`, [user.id, weekStartTs]).catch(()=>({rows:[{n:0}]}));
        weekStats.reactionsGiven    = rxG.rows[0]?.n || 0;
        weekStats.reactionsReceived = rxR.rows[0]?.n || 0;
        weekStats.signalsSent       = sgs.rows[0]?.n || 0;
      }
    } catch(_) {}

    const defs = getWeeklyChallenges();
    const challenges = defs.map(ch => {
      let completed = false;
      try { completed = !!ch.check(user, weekStats); } catch(_) {}
      const prog = getChallengeProgress(ch.id, weekStats);
      return { id:ch.id, emoji:ch.emoji, name:ch.name, desc:ch.desc, aura:ch.aura, completed, progress:prog };
    });

    res.json({ ok:true, challenges, weekStats });
  } catch(e) {
    console.error("[challenges]", e.message);
    res.json({ ok:true, challenges:[], weekStats:{} }); // не падаем — возвращаем пустой массив
  }
});


// ── Vibe Zones ────────────────────────────────────────────
app.post("/api/zones", requireAuth, async (req, res) => {
  const { name, emoji, lat, lng, radius_m, track, artist, genre } = req.body;
  if (!name || !lat || !lng) return res.status(400).json({ ok:false, error:"Нужны name, lat, lng" });
  const pool = db.pgPool();
  if (!pool) return res.json({ ok:false, error:"БД недоступна" });
  try {
    const id = 'zone_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const expiresAt = Date.now() + 4 * 60 * 60 * 1000; // 4 часа
    await pool.query(
      `INSERT INTO vibe_zones(id,creator_id,name,emoji,lat,lng,radius_m,track,artist,genre,created_at,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, req.user.id, String(name).slice(0,50), emoji||'🔥',
       parseFloat(lat), parseFloat(lng), Math.min(parseInt(radius_m)||300, 1000),
       track||'', artist||'', genre||'', Date.now(), expiresAt]
    );
    res.json({ ok:true, id, expiresAt });
  } catch(e) { console.error('[zones POST]', e.message); res.status(500).json({ ok:false }); }
});

app.get("/api/zones", requireAuth, async (req, res) => {
  const { lat, lng } = req.query;
  const pool = db.pgPool();
  if (!pool) return res.json({ ok:true, zones:[] });
  try {
    // Активные зоны — не просроченные
    const r = await pool.query(
      `SELECT z.*, u.name as creator_name, u.avatar as creator_avatar
       FROM vibe_zones z JOIN users u ON u.id=z.creator_id
       WHERE z.expires_at > $1
       ORDER BY z.created_at DESC LIMIT 50`,
      [Date.now()]
    );
    const zones = r.rows.map(z => ({
      id: z.id, name: z.name, emoji: z.emoji,
      lat: z.lat, lng: z.lng, radius: z.radius_m,
      track: z.track, artist: z.artist, genre: z.genre,
      creatorName: z.creator_name, creatorAvatar: z.creator_avatar,
      createdAt: z.created_at, expiresAt: z.expires_at,
    }));
    res.json({ ok:true, zones });
  } catch(e) { res.json({ ok:true, zones:[] }); }
});

app.patch("/api/zones/:id", requireAuth, async (req, res) => {
  const pool = db.pgPool();
  if (!pool) return res.json({ ok:false });
  const { name, emoji } = req.body;
  try {
    const sets = []; const vals = [];
    if (name)  { sets.push(`name=$${vals.push(String(name).slice(0,50))}`); }
    if (emoji) { sets.push(`emoji=$${vals.push(emoji)}`); }
    if (!sets.length) return res.json({ ok:true });
    vals.push(req.params.id); vals.push(req.user.id);
    await pool.query(`UPDATE vibe_zones SET ${sets.join(',')} WHERE id=$${vals.length-1} AND creator_id=$${vals.length}`, vals);
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false }); }
});

app.delete("/api/zones/:id", requireAuth, async (req, res) => {
  const pool = db.pgPool();
  if (!pool) return res.json({ ok:false });
  try {
    await pool.query(`DELETE FROM vibe_zones WHERE id=$1 AND creator_id=$2`, [req.params.id, req.user.id]);
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false }); }
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



// ── 404 ───────────────────────────────────────────────────
app.use((_,res) => res.status(404).sendFile(path.join(publicDir,"index.html")));

// ── Global error handler ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[server error]", err.message);
  res.status(500).json({ ok: false, error: "Внутренняя ошибка сервера" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`+aura запущен на http://127.0.0.1:${PORT}`));
