/**
 * db.js — минимальная JSON-база данных
 * Хранит пользователей в data/users.json
 * В будущем легко заменить на PostgreSQL — интерфейс тот же
 */

const fs   = require("fs");
const path = require("path");

const DATA_DIR  = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

// Создаём папку data если нет
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]", "utf8");

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

function findById(id) {
  return readUsers().find((u) => u.id === id) || null;
}

function findByEmail(email) {
  return readUsers().find((u) => u.email === email.toLowerCase()) || null;
}

function createUser({ email, passwordHash, name = "", age = "", city = "", bio = "" }) {
  const users = readUsers();
  const user  = {
    id:               "u_" + Date.now(),
    email:            email.toLowerCase(),
    passwordHash,
    name,
    age,
    city,
    bio,
    avatar:           null,
    spotifyConnected: false,
    spotifyName:      "",
    spotifyId:        "",
    spotifyAccessToken:  "",
    spotifyRefreshToken: "",
    createdAt:        new Date().toISOString()
  };
  users.push(user);
  writeUsers(users);
  return user;
}

function updateUser(id, patch) {
  const users = readUsers();
  const idx   = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  // Никогда не перезаписываем passwordHash через patch случайно
  const { passwordHash, ...safePatch } = patch;
  users[idx] = { ...users[idx], ...safePatch };
  writeUsers(users);
  return users[idx];
}

// Публичные поля — без пароля и токенов для отдачи клиенту
function publicProfile(user) {
  if (!user) return null;
  const {
    passwordHash,
    spotifyAccessToken,
    spotifyRefreshToken,
    ...pub
  } = user;
  return pub;
}

module.exports = { findById, findByEmail, createUser, updateUser, publicProfile };
