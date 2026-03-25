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
      spotify_connected BOOLEAN DEFAULT false,
      spotify_name TEXT DEFAULT '',
      spotify_id TEXT DEFAULT '',
      spotify_access_token TEXT DEFAULT '',
      spotify_refresh_token TEXT DEFAULT '',
      lastfm_connected BOOLEAN DEFAULT false,
      lastfm_username TEXT DEFAULT '',
      current_track JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).then(() => console.log("[db] PostgreSQL ready"))
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
    spotifyConnected:    row.spotify_connected || false,
    spotifyName:         row.spotify_name || "",
    spotifyId:           row.spotify_id || "",
    spotifyAccessToken:  row.spotify_access_token || "",
    spotifyRefreshToken: row.spotify_refresh_token || "",
    lastfmConnected:     row.lastfm_connected || false,
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
    name: "name", age: "age", city: "city", bio: "bio", avatar: "avatar",
    spotifyConnected: "spotify_connected", spotifyName: "spotify_name",
    spotifyId: "spotify_id", spotifyAccessToken: "spotify_access_token",
    spotifyRefreshToken: "spotify_refresh_token",
    lastfmConnected: "lastfm_connected", lastfmUsername: "lastfm_username",
    currentTrack: "current_track",
  };

  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      sets.push(`${col}=$${i++}`);
      vals.push(key === "currentTrack" ? JSON.stringify(patch[key]) : patch[key]);
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
    lastfmConnected: false, lastfmUsername: "",
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
  const cutoff = Date.now() - 2 * 60 * 1000;
  for (const [uid, data] of _nowPlaying) {
    if (data.updatedAt < cutoff) _nowPlaying.delete(uid);
  }
}, 30 * 1000);

function setNowPlaying(userId, data) {
  _nowPlaying.set(userId, { ...data, updatedAt: Date.now() });
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
    if (userId === excludeUserId || !data.lat || !data.lng) continue;
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
  return results.sort((a,b) => a.distKm - b.distKm);
}

// ═══════════════════════════════════════════════════
// Signals & Chats (in-memory — reset on restart ok)
// ═══════════════════════════════════════════════════
const _signals = new Map();
let _sigCounter = 0;

function createSignal({ fromId, toId, type, track, artist, matchType }) {
  const id = "sig_" + (++_sigCounter) + "_" + Date.now();
  const signal = { id, fromId, toId, type, track, artist, matchType, status:"pending", createdAt:Date.now() };
  _signals.set(id, signal);
  return signal;
}

function getSignalsForUser(userId) {
  return [..._signals.values()].filter(s => s.toId===userId).sort((a,b) => b.createdAt-a.createdAt);
}

function getSentSignalsForUser(userId) {
  return [..._signals.values()].filter(s => s.fromId===userId).sort((a,b) => b.createdAt-a.createdAt);
}

function getSignalById(id) { return _signals.get(id)||null; }

function acceptSignal(id) {
  const s = _signals.get(id);
  if (!s) return null;
  s.status = "accepted";
  s.chatId = createOrGetChat(s.fromId, s.toId);
  return s;
}

function ignoreSignal(id) {
  const s = _signals.get(id);
  if (s) s.status = "ignored";
  return s;
}

const _chats = new Map();
let _chatCounter = 0;

function createOrGetChat(userIdA, userIdB) {
  for (const [id, chat] of _chats) {
    if (chat.userIds.includes(userIdA) && chat.userIds.includes(userIdB)) return id;
  }
  const id = "chat_" + (++_chatCounter) + "_" + Date.now();
  _chats.set(id, { id, userIds:[userIdA, userIdB], messages:[], createdAt:Date.now() });
  return id;
}

function getChatsForUser(userId) {
  return [..._chats.values()].filter(c => c.userIds.includes(userId)).sort((a,b) => {
    const lastA = a.messages[a.messages.length-1]?.createdAt || a.createdAt;
    const lastB = b.messages[b.messages.length-1]?.createdAt || b.createdAt;
    return lastB - lastA;
  });
}

function getChatById(id) { return _chats.get(id)||null; }

function sendMessage(chatId, fromId, text) {
  const chat = _chats.get(chatId);
  if (!chat) return null;
  const msg = { id:"msg_"+Date.now(), fromId, text:String(text).slice(0,1000), createdAt:Date.now() };
  chat.messages.push(msg);
  return msg;
}

module.exports = {
  findById, findByEmail, createUser, updateUser, publicProfile,
  setNowPlaying, getNearbyUsers,
  createSignal, getSignalsForUser, getSentSignalsForUser, getSignalById, acceptSignal, ignoreSignal,
  createOrGetChat, getChatsForUser, getChatById, sendMessage
};
