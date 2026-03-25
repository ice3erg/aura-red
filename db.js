/**
 * db.js — in-memory хранилище с persist в файл (если доступно)
 * На Render filesystem ephemeral — пользователи живут пока процесс жив.
 * Для production нужна внешняя БД (PostgreSQL/MongoDB).
 */

const fs   = require("fs");
const path = require("path");

// Пробуем использовать файл, но не падаем если нельзя
const DATA_DIR   = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

// In-memory store — главный источник правды
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
    console.warn("[db] file storage unavailable, using in-memory only:", e.message);
    _fileAvailable = false;
  }
}

function persistUsers() {
  if (!_fileAvailable) return;
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(_users, null, 2), "utf8");
  } catch (e) {
    console.warn("[db] failed to persist:", e.message);
  }
}

initStorage();

function findById(id)       { return _users.find(u => u.id === id) || null; }
function findByEmail(email) { return _users.find(u => u.email === email.toLowerCase()) || null; }

function createUser({ email, passwordHash, name = "", age = "", city = "", bio = "" }) {
  const user = {
    id:                  "u_" + Date.now(),
    email:               email.toLowerCase(),
    passwordHash,
    name, age, city, bio,
    avatar:              null,
    spotifyConnected:    false,
    spotifyName:         "",
    spotifyId:           "",
    spotifyAccessToken:  "",
    spotifyRefreshToken: "",
    lastfmConnected:     false,
    lastfmUsername:      "",
    createdAt:           new Date().toISOString()
  };
  _users.push(user);
  persistUsers();
  return user;
}

function updateUser(id, patch) {
  const idx = _users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  // Не перезаписываем passwordHash через patch
  const { passwordHash, ...safePatch } = patch;
  _users[idx] = { ..._users[idx], ...safePatch };
  persistUsers();
  return _users[idx];
}

// Публичный профиль — без секретов
function publicProfile(user) {
  if (!user) return null;
  const { passwordHash, spotifyAccessToken, spotifyRefreshToken, ...pub } = user;
  return pub;
}

module.exports = { findById, findByEmail, createUser, updateUser, publicProfile };
