const express = require('express');
const path = require('path');

const app = express();
const publicDir = path.join(__dirname, 'public');

app.use(express.static(publicDir));

const routes = {
  '/': 'index.html',
  '/login': 'login.html',
  '/signup': 'signup.html',
  '/onboarding': 'onboarding.html',
  '/home': 'home.html',
  '/profile': 'profile.html',
  '/connect-music': 'connect-music.html',
  '/map': 'map.html',
  '/chat': 'chat.html',
  '/demo': 'demo.html'
};

Object.entries(routes).forEach(([route, file]) => {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(publicDir, file));
  });
});

app.get('/spotify/login', (_req, res) => {
  res.redirect('/connect-music?demo=spotify');
});

app.get('/spotify/callback', (_req, res) => {
  res.redirect('/connect-music?spotify=connected');
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`+aura running on http://localhost:${PORT}`);
});
