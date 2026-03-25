/**
 * db.js — in-memory + file persist
 * На Render filesystem ephemeral — для production нужна PostgreSQL.
 */

const fs   = require("fs");
const path = require("path");

const DATA_DIR   = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

let _users = [];
let _fileAvailable = false;

function initStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(USERS_FILE)) {
      _users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    } else {
      fs.writeFileSync(USERS_FILE, "[]", "utf8");
    }
    _fileAvailable = true;
    console.log(`[db] loaded ${_users.length} users from file`);
  } catch (e) {
    console.warn("[db] file storage unavailable:", e.message);
  }
}

function persistUsers() {
  if (!_fileAvailable) return;
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(_users, null, 2), "utf8"); }
  catch (e) { console.warn("[db] persist failed:", e.message); }
}

initStorage();

function findById(id)       { return _users.find(u => u.id === id) || null; }
function findByEmail(email) { return _users.find(u => u.email === email.toLowerCase()) || null; }

function createUser({ email, passwordHash, name="", age="", city="", bio="" }) {
  const user = {
    id: "u_" + Date.now(), email: email.toLowerCase(), passwordHash,
    name, age, city, bio, avatar: null,
    spotifyConnected: false, spotifyName: "", spotifyId: "",
    spotifyAccessToken: "", spotifyRefreshToken: "",
    lastfmConnected: false, lastfmUsername: "",
    createdAt: new Date().toISOString()
  };
  _users.push(user);
  persistUsers();
  return user;
}

function updateUser(id, patch) {
  const idx = _users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  const { passwordHash, ...safePatch } = patch;
  _users[idx] = { ..._users[idx], ...safePatch };
  persistUsers();
  return _users[idx];
}

function publicProfile(user) {
  if (!user) return null;
  const { passwordHash, spotifyAccessToken, spotifyRefreshToken, ...pub } = user;
  return pub;
}

// ── Radar store ────────────────────────────────────────────
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

function getNearbyUsers(lat, lng, radiusKm, excludeUserId) {
  const results = [];
  for (const [userId, data] of _nowPlaying) {
    if (userId === excludeUserId || !data.lat || !data.lng) continue;
    const dist = haversineKm(lat, lng, data.lat, data.lng);
    if (dist <= radiusKm) {
      const user = findById(userId);
      if (!user) continue;
      results.push({
        userId, name: user.name || "Аноним", avatar: user.avatar || null,
        city: user.city || "", track: data.track || "", artist: data.artist || "",
        album: data.album || "", image: data.image || "", url: data.url || "",
        source: data.source || "", lat: data.lat, lng: data.lng,
        distKm: Math.round(dist * 10) / 10, updatedAt: data.updatedAt
      });
    }
  }
  return results.sort((a, b) => a.distKm - b.distKm);
}

// ── Signals store ──────────────────────────────────────────
const _signals = new Map();
let _sigCounter = 0;

function createSignal({ fromId, toId, type, track, artist, matchType }) {
  const id = "sig_" + (++_sigCounter) + "_" + Date.now();
  const signal = { id, fromId, toId, type, track, artist, matchType, status: "pending", createdAt: Date.now() };
  _signals.set(id, signal);
  return signal;
}

function getSignalsForUser(userId) {
  return [..._signals.values()].filter(s => s.toId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

function getSignalById(id) { return _signals.get(id) || null; }

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

// ── Chats store ────────────────────────────────────────────
const _chats = new Map();
let _chatCounter = 0;

function createOrGetChat(userIdA, userIdB) {
  for (const [id, chat] of _chats) {
    if (chat.userIds.includes(userIdA) && chat.userIds.includes(userIdB)) return id;
  }
  const id = "chat_" + (++_chatCounter) + "_" + Date.now();
  _chats.set(id, { id, userIds: [userIdA, userIdB], messages: [], createdAt: Date.now() });
  return id;
}

function getChatsForUser(userId) {
  return [..._chats.values()].filter(c => c.userIds.includes(userId)).sort((a, b) => {
    const lastA = a.messages[a.messages.length - 1]?.createdAt || a.createdAt;
    const lastB = b.messages[b.messages.length - 1]?.createdAt || b.createdAt;
    return lastB - lastA;
  });
}

function getChatById(id) { return _chats.get(id) || null; }

function sendMessage(chatId, fromId, text) {
  const chat = _chats.get(chatId);
  if (!chat) return null;
  const msg = { id: "msg_" + Date.now(), fromId, text: String(text).slice(0, 1000), createdAt: Date.now() };
  chat.messages.push(msg);
  return msg;
}

module.exports = {
  findById, findByEmail, createUser, updateUser, publicProfile,
  setNowPlaying, getNearbyUsers,
  createSignal, getSignalsForUser, getSignalById, acceptSignal, ignoreSignal,
  createOrGetChat, getChatsForUser, getChatById, sendMessage
};
