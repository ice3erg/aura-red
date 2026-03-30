/**
 * db.js — PostgreSQL + in-memory fallback
 * Если DATABASE_URL задан — используем PostgreSQL (Render, Railway и т.д.)
 * Если нет — in-memory с file persist (локальная разработка)
 */

const fs   = require("fs");
const path = require("path");

const USE_PG = !!process.env.DATABASE_URL;

// ═══════════════════════════════════════════════════
// PostgreSQL режим
// ═══════════════════════════════════════════════════
let pgPool = null;
if (USE_PG) {
  const { Pool } = require("pg");
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  // Создаём таблицы при старте
  pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT DEFAULT '',
      age TEXT DEFAULT '',
      city TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      avatar TEXT,
      cover TEXT,
      photos JSONB DEFAULT '[]',
      aura_points INTEGER DEFAULT 0,
      track_history JSONB DEFAULT '[]',
      spotify_connected BOOLEAN DEFAULT false,
      spotify_name TEXT DEFAULT '',
      spotify_id TEXT DEFAULT '',
      spotify_access_token TEXT DEFAULT '',
      spotify_refresh_token TEXT DEFAULT '',
      lastfm_connected BOOLEAN DEFAULT false,
      lastfm_username TEXT DEFAULT '',
      yandex_token TEXT DEFAULT '',
      current_track JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).then(() => {
    // Добавляем cover для существующих БД (безопасно — IF NOT EXISTS)
    return pgPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cover TEXT`)
      .then(() => pgPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'`))
      .then(() => pgPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS track_history JSONB DEFAULT '[]'`))
      .then(() => pgPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS aura_points INTEGER DEFAULT 0`))
      .then(() => pgPool.query(`ALTER TABLE signals ADD COLUMN IF NOT EXISTS seen_by_from BOOLEAN DEFAULT false`))
      .then(() => pgPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS yandex_token TEXT DEFAULT ''`))
      .then(() => pgPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0`))
      .then(() => pgPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_last DATE`))
      .then(() => pgPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE`))
      .then(() => pgPool.query(`
        CREATE TABLE IF NOT EXISTS reactions (
          id TEXT PRIMARY KEY,
          from_id TEXT NOT NULL,
          to_id TEXT NOT NULL,
          track TEXT DEFAULT '',
          artist TEXT DEFAULT '',
          emoji TEXT NOT NULL,
          created_at BIGINT DEFAULT extract(epoch from now())*1000
        )
      `));
  }).then(() => console.log("[db] PostgreSQL ready"))
    .catch(e => console.error("[db] PG init error:", e.message));
}

// ── PG helpers ─────────────────────────────────────
function rowToUser(row) {
  if (!row) return null;
  return {
    id:                  row.id,
    email:               row.email,
    passwordHash:        row.password_hash,
    name:                row.name || "",
    age:                 row.age  || "",
    city:                row.city || "",
    bio:                 row.bio  || "",
    avatar:              row.avatar || null,
    cover:               row.cover  || null,
    photos:              row.photos  || [],
    trackHistory:        row.track_history || [],
    auraPoints:          row.aura_points || 0,
    streakDays:          row.streak_days  || 0,
    streakLast:          row.streak_last  || null,
    username:            row.username     || null,
    vkConnected:         row.vk_connected || false,
    vkUsername:          row.vk_username  || '',
    achievements:        row.achievements || [],
    title:               row.title        || '',
    spotifyConnected:    row.spotify_connected || false,
    spotifyName:         row.spotify_name || "",
    spotifyId:           row.spotify_id || "",
    spotifyAccessToken:  row.spotify_access_token || "",
    spotifyRefreshToken: row.spotify_refresh_token || "",
    lastfmConnected:     row.lastfm_connected || false,
    yandexToken:         row.yandex_token || '',
    lastfmUsername:      row.lastfm_username || "",
    currentTrack:        row.current_track || null,
    createdAt:           row.created_at,
  };
}

async function pgFindById(id) {
  const r = await pgPool.query("SELECT * FROM users WHERE id=$1", [id]);
  return rowToUser(r.rows[0]);
}

async function pgFindByEmail(email) {
  const r = await pgPool.query("SELECT * FROM users WHERE email=$1", [email.toLowerCase()]);
  return rowToUser(r.rows[0]);
}

async function pgCreateUser({ email, passwordHash, name="", age="", city="", bio="" }) {
  const id = "u_" + Date.now();
  await pgPool.query(
    `INSERT INTO users (id,email,password_hash,name,age,city,bio) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, email.toLowerCase(), passwordHash, name, age, city, bio]
  );
  return pgFindById(id);
}

async function pgUpdateUser(id, patch) {
  const sets = [];
  const vals = [];
  let i = 1;

  const map = {
    name: "name", age: "age", city: "city", bio: "bio", avatar: "avatar", cover: "cover", photos: "photos", trackHistory: "track_history", auraPoints: "aura_points",
    spotifyConnected: "spotify_connected", spotifyName: "spotify_name",
    spotifyId: "spotify_id", spotifyAccessToken: "spotify_access_token",
    spotifyRefreshToken: "spotify_refresh_token",
    lastfmConnected: "lastfm_connected", lastfmUsername: "lastfm_username", yandexToken: "yandex_token",
    currentTrack: "current_track",
    username: "username",
    streakDays: "streak_days", streakLast: "streak_last",
    vkConnected: "vk_connected", vkUsername: "vk_username",
    achievements: "achievements", title: "title",
  };

  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      sets.push(`${col}=$${i++}`);
      vals.push(["currentTrack","photos","trackHistory"].includes(key) ? JSON.stringify(patch[key]) : patch[key]);
    }
  }

  if (!sets.length) return pgFindById(id);
  vals.push(id);
  await pgPool.query(`UPDATE users SET ${sets.join(",")} WHERE id=$${i}`, vals);
  return pgFindById(id);
}

// ═══════════════════════════════════════════════════
// In-memory + file fallback
// ═══════════════════════════════════════════════════
const DATA_DIR   = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
let _users = [];
let _fileAvailable = false;

if (!USE_PG) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(USERS_FILE)) {
      _users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    } else {
      fs.writeFileSync(USERS_FILE, "[]", "utf8");
    }
    _fileAvailable = true;
    console.log(`[db] in-memory loaded ${_users.length} users`);
  } catch (e) {
    console.warn("[db] file unavailable:", e.message);
  }
}

function _persist() {
  if (!_fileAvailable) return;
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(_users, null, 2), "utf8"); } catch {}
}

// ═══════════════════════════════════════════════════
// Unified async API
// ═══════════════════════════════════════════════════
async function findById(id) {
  if (USE_PG) return pgFindById(id);
  return _users.find(u => u.id === id) || null;
}

async function getAllUsers() {
  if (USE_PG) {
    const r = await pgPool.query("SELECT * FROM users ORDER BY created_at DESC");
    return r.rows.map(rowToUser);
  }
  return [..._users];
}

async function findByEmail(email) {
  if (USE_PG) return pgFindByEmail(email);
  return _users.find(u => u.email === email.toLowerCase()) || null;
}

async function createUser(data) {
  if (USE_PG) return pgCreateUser(data);
  const user = {
    id: "u_" + Date.now(), email: data.email.toLowerCase(),
    passwordHash: data.passwordHash,
    name: data.name||"", age: data.age||"", city: data.city||"", bio: data.bio||"",
    avatar: null,
    spotifyConnected: false, spotifyName: "", spotifyId: "",
    spotifyAccessToken: "", spotifyRefreshToken: "",
    lastfmConnected: false, lastfmUsername: "", yandexToken: "",
    currentTrack: null, createdAt: new Date().toISOString()
  };
  _users.push(user);
  _persist();
  return user;
}

async function updateUser(id, patch) {
  if (USE_PG) return pgUpdateUser(id, patch);
  const idx = _users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  const { passwordHash, ...safePatch } = patch;
  _users[idx] = { ..._users[idx], ...safePatch };
  _persist();
  return _users[idx];
}

function publicProfile(user) {
  if (!user) return null;
  const { passwordHash, spotifyAccessToken, spotifyRefreshToken, ...pub } = user;
  return pub;
}

// ═══════════════════════════════════════════════════
// Radar store (always in-memory — real-time data)
// ═══════════════════════════════════════════════════
const _nowPlaying = new Map();

setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [uid, data] of _nowPlaying) {
    if (data.updatedAt < cutoff) _nowPlaying.delete(uid);
  }
}, 30 * 1000);

function setNowPlaying(userId, data) {
  _nowPlaying.set(userId, { ...data, updatedAt: Date.now() });
}

function getMyNowPlaying(userId) {
  return _nowPlaying.get(userId) || null;
}

async function getAllNowPlaying() {
  const results = [];
  for (const [userId, data] of _nowPlaying) {
    const user = await findById(userId).catch(() => null);
    results.push({ userId, name: user?.name || "?", ...data });
  }
  return results;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function getNearbyUsers(lat, lng, radiusKm, excludeUserId) {
  const results = [];
  for (const [userId, data] of _nowPlaying) {
    if (userId === excludeUserId) continue;
    // Если нет геолокации но есть трек — показываем как "рядом" (расстояние неизвестно)
    if (!data.lat || !data.lng) {
      const user = await findById(userId);
      if (!user) continue;
      results.push({
        userId, name: user.name||"Аноним", avatar: user.avatar||null,
        city: user.city||"", track: data.track||"", artist: data.artist||"",
        album: data.album||"", image: data.image||"", url: data.url||"",
        source: data.source||"", lat: lat, lng: lng, // показываем рядом с текущим пользователем
        distKm: null, noGeo: true, updatedAt: data.updatedAt
      });
      continue;
    }
    const dist = haversineKm(lat, lng, data.lat, data.lng);
    if (dist <= radiusKm) {
      const user = await findById(userId);
      if (!user) continue;
      results.push({
        userId, name: user.name||"Аноним", avatar: user.avatar||null,
        city: user.city||"", track: data.track||"", artist: data.artist||"",
        album: data.album||"", image: data.image||"", url: data.url||"",
        source: data.source||"", lat: data.lat, lng: data.lng,
        distKm: Math.round(dist*10)/10, updatedAt: data.updatedAt
      });
    }
  }
  // Сначала с геолокацией (по дистанции), потом без
  return results.sort((a,b) => {
    if (a.distKm === null) return 1;
    if (b.distKm === null) return -1;
    return a.distKm - b.distKm;
  });
}

// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// Signals & Chats — PostgreSQL + in-memory fallback
// ═══════════════════════════════════════════════════

// Создаём таблицы если используем PG
if (USE_PG) {
  pgPool.query(`
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      type TEXT DEFAULT 'wave',
      track TEXT DEFAULT '',
      artist TEXT DEFAULT '',
      match_type TEXT DEFAULT 'same-vibe',
      status TEXT DEFAULT 'pending',
      chat_id TEXT,
      seen_by_from BOOLEAN DEFAULT false,
      created_at BIGINT DEFAULT extract(epoch from now())*1000
    )
  `).catch(e => console.error('[db] signals table error:', e.message));

  pgPool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_ids TEXT[] NOT NULL,
      created_at BIGINT DEFAULT extract(epoch from now())*1000
    )
  `).catch(e => console.error('[db] chats table error:', e.message));

  pgPool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      from_id TEXT DEFAULT 'system',
      text TEXT NOT NULL,
      created_at BIGINT DEFAULT extract(epoch from now())*1000
    )
  `).catch(e => console.error('[db] messages table error:', e.message));
}

// ── In-memory fallback ────────────────────────────
const _signals = new Map();
let _sigCounter = 0;
const _chats = new Map();
let _chatCounter = 0;

// ── Signals ───────────────────────────────────────
async function createSignal({ fromId, toId, type, track, artist, matchType }) {
  const id = 'sig_' + (++_sigCounter) + '_' + Date.now();
  const sig = { id, fromId, toId, type: type||'wave', track: track||'', artist: artist||'', matchType: matchType||'same-vibe', status: 'pending', createdAt: Date.now() };
  if (USE_PG) {
    await pgPool.query(
      `INSERT INTO signals(id,from_id,to_id,type,track,artist,match_type,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8) ON CONFLICT DO NOTHING`,
      [id, fromId, toId, sig.type, sig.track, sig.artist, sig.matchType, sig.createdAt]
    );
  } else {
    _signals.set(id, sig);
  }
  return sig;
}

function pgRowToSignal(r) {
  return { id: r.id, fromId: r.from_id, toId: r.to_id, type: r.type, track: r.track, artist: r.artist, matchType: r.match_type, status: r.status, chatId: r.chat_id, seenByFrom: r.seen_by_from || false, createdAt: Number(r.created_at) };
}

async function markSignalsSeenByFrom(userId) {
  if (USE_PG) {
    await pgPool.query(`UPDATE signals SET seen_by_from=true WHERE from_id=$1 AND status='accepted'`, [userId]);
  } else {
    for (const s of _signals.values()) {
      if (s.fromId === userId && s.status === 'accepted') s.seenByFrom = true;
    }
  }
}

async function getSignalsForUser(userId) {
  if (USE_PG) {
    const r = await pgPool.query(`SELECT * FROM signals WHERE to_id=$1 ORDER BY created_at DESC`, [userId]);
    return r.rows.map(pgRowToSignal);
  }
  return [..._signals.values()].filter(s => s.toId===userId).sort((a,b) => b.createdAt-a.createdAt);
}

async function getSentSignalsForUser(userId) {
  if (USE_PG) {
    const r = await pgPool.query(`SELECT * FROM signals WHERE from_id=$1 ORDER BY created_at DESC`, [userId]);
    return r.rows.map(pgRowToSignal);
  }
  return [..._signals.values()].filter(s => s.fromId===userId).sort((a,b) => b.createdAt-a.createdAt);
}

async function getSignalById(id) {
  if (USE_PG) {
    const r = await pgPool.query(`SELECT * FROM signals WHERE id=$1`, [id]);
    return r.rows[0] ? pgRowToSignal(r.rows[0]) : null;
  }
  return _signals.get(id)||null;
}

async function acceptSignal(id) {
  const s = await getSignalById(id);
  if (!s) return null;
  const chatId = await createOrGetChat(s.fromId, s.toId);
  if (USE_PG) {
    await pgPool.query(`UPDATE signals SET status='accepted', chat_id=$1 WHERE id=$2`, [chatId, id]);
  } else {
    const ms = _signals.get(id);
    if (ms) { ms.status = 'accepted'; ms.chatId = chatId; }
  }
  return { ...s, status: 'accepted', chatId };
}

async function ignoreSignal(id) {
  if (USE_PG) {
    await pgPool.query(`UPDATE signals SET status='ignored' WHERE id=$1`, [id]);
  } else {
    const s = _signals.get(id);
    if (s) s.status = 'ignored';
  }
}

// ── Chats ─────────────────────────────────────────
async function createOrGetChat(userIdA, userIdB) {
  if (USE_PG) {
    const existing = await pgPool.query(
      `SELECT id FROM chats WHERE $1=ANY(user_ids) AND $2=ANY(user_ids)`,
      [userIdA, userIdB]
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const id = 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    await pgPool.query(`INSERT INTO chats(id,user_ids,created_at) VALUES($1,$2,$3)`, [id, [userIdA,userIdB], Date.now()]);
    return id;
  }
  for (const [id, chat] of _chats) {
    if (chat.userIds.includes(userIdA) && chat.userIds.includes(userIdB)) return id;
  }
  const id = 'chat_' + (++_chatCounter) + '_' + Date.now();
  _chats.set(id, { id, userIds:[userIdA,userIdB], messages:[], createdAt:Date.now() });
  return id;
}

async function getChatsForUser(userId) {
  if (USE_PG) {
    const r = await pgPool.query(
      `SELECT * FROM chats WHERE $1=ANY(user_ids) ORDER BY created_at DESC`,
      [userId]
    );
    return Promise.all(r.rows.map(async row => {
      const msgs = await pgPool.query(
        `SELECT * FROM messages WHERE chat_id=$1 ORDER BY created_at ASC`, [row.id]
      );
      return {
        id: row.id,
        userIds: row.user_ids || [],
        createdAt: Number(row.created_at),
        messages: msgs.rows.map(m => ({ id:m.id, fromId:m.from_id, text:m.text, createdAt:Number(m.created_at) }))
      };
    }));
  }
  return [..._chats.values()].filter(c => c.userIds.includes(userId)).sort((a,b) => {
    const lastA = a.messages[a.messages.length-1]?.createdAt || a.createdAt;
    const lastB = b.messages[b.messages.length-1]?.createdAt || b.createdAt;
    return lastB - lastA;
  });
}

async function getChatById(id) {
  if (USE_PG) {
    const r = await pgPool.query(`SELECT * FROM chats WHERE id=$1`, [id]);
    if (!r.rows[0]) return null;
    const msgs = await pgPool.query(`SELECT * FROM messages WHERE chat_id=$1 ORDER BY created_at ASC`, [id]);
    return {
      id: r.rows[0].id,
      userIds: r.rows[0].user_ids,
      createdAt: Number(r.rows[0].created_at),
      messages: msgs.rows.map(m => ({ id:m.id, fromId:m.from_id, text:m.text, createdAt:Number(m.created_at) }))
    };
  }
  return _chats.get(id)||null;
}

async function sendMessage(chatId, fromId, text) {
  const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const msg = { id, fromId, text: String(text).slice(0,1000), createdAt: Date.now() };
  if (USE_PG) {
    await pgPool.query(
      `INSERT INTO messages(id,chat_id,from_id,text,created_at) VALUES($1,$2,$3,$4,$5)`,
      [id, chatId, fromId, msg.text, msg.createdAt]
    );
  } else {
    const chat = _chats.get(chatId);
    if (chat) chat.messages.push(msg);
  }
  return msg;
}

module.exports = {
  pgPool: () => pgPool,
  findById, findByEmail, getAllUsers, createUser, updateUser, publicProfile,
  setNowPlaying, getMyNowPlaying, getAllNowPlaying, getNearbyUsers,
  createSignal, getSignalsForUser, getSentSignalsForUser, getSignalById, acceptSignal, ignoreSignal, markSignalsSeenByFrom,
  createOrGetChat, getChatsForUser, getChatById, sendMessage
};
