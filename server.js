require("dotenv").config();

const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir));
app.use(express.json());

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

const routes = {
  "/": "index.html",
  "/login": "login.html",
  "/signup": "signup.html",
  "/onboarding": "onboarding.html",
  "/connect-music": "connect-music.html",
  "/connect-success": "connect-success.html",
  "/home": "home.html",
  "/profile": "profile.html",
  "/map": "map.html",
  "/chat": "chat.html"
};

Object.entries(routes).forEach(([route, file]) => {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(publicDir, file));
  });
});

app.get("/debug/env", (_req, res) => {
  res.json({
    hasClientId: !!CLIENT_ID,
    hasClientSecret: !!CLIENT_SECRET,
    redirectUri: REDIRECT_URI || null
  });
});

app.get("/spotify/login", (_req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return res.status(500).send("Не заданы переменные Spotify в .env");
  }

  const scope = [
    "user-read-email",
    "user-read-private",
    "user-read-currently-playing",
    "user-read-playback-state"
  ].join(" ");

  const authURL =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      scope,
      redirect_uri: REDIRECT_URI
    }).toString();

  console.log("SPOTIFY LOGIN HIT");
  console.log("REDIRECT_URI:", REDIRECT_URI);

  res.redirect(authURL);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const spotifyError = req.query.error;

  if (spotifyError) {
    console.error("Spotify error:", spotifyError);
    return res.redirect(`/connect-music?error=${encodeURIComponent(spotifyError)}`);
  }

  if (!code) {
    return res.redirect("/connect-music?error=no_code");
  }

  try {
    const tokenRes = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code"
      }).toString(),
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        timeout: 15000
      }
    );

    const accessToken = tokenRes.data.access_token;
    const refreshToken = tokenRes.data.refresh_token || "";

    const profileRes = await axios.get("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      timeout: 15000
    });

    const profile = profileRes.data;

    const redirectUrl =
      "/connect-success?" +
      new URLSearchParams({
        spotifyConnected: "true",
        spotifyName: profile.display_name || "",
        spotifyId: profile.id || "",
        accessToken,
        refreshToken
      }).toString();

    res.redirect(redirectUrl);
  } catch (error) {
    console.error(
      "Spotify callback error:",
      error.response?.data || error.code || error.message
    );
    res.redirect("/connect-music?error=spotify_callback_failed");
  }
});

app.get("/spotify/callback", (req, res) => {
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.redirect(`/callback${query}`);
});

app.get("/api/spotify/current-track", async (req, res) => {
  const accessToken = req.query.accessToken;

  if (!accessToken) {
    return res.status(400).json({
      ok: false,
      error: "Нет access token"
    });
  }

  try {
    const trackRes = await axios.get(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        validateStatus: () => true,
        timeout: 15000
      }
    );

    if (trackRes.status === 204) {
      return res.json({
        ok: true,
        isPlaying: false,
        track: null
      });
    }

    if (trackRes.status === 401) {
      return res.status(401).json({
        ok: false,
        error: "Токен Spotify недействителен или истёк"
      });
    }

    if (trackRes.status >= 400) {
      return res.status(trackRes.status).json({
        ok: false,
        error: "Не удалось получить текущий трек",
        details: trackRes.data
      });
    }

    const data = trackRes.data;
    const item = data?.item;

    if (!item) {
      return res.json({
        ok: true,
        isPlaying: false,
        track: null
      });
    }

    res.json({
      ok: true,
      isPlaying: !!data.is_playing,
      track: {
        name: item.name || "",
        artists: Array.isArray(item.artists)
          ? item.artists.map((a) => a.name).join(", ")
          : "",
        album: item.album?.name || "",
        image: item.album?.images?.[0]?.url || "",
        url: item.external_urls?.spotify || "",
        progressMs: data.progress_ms || 0,
        durationMs: item.duration_ms || 0
      }
    });
  } catch (error) {
    console.error(
      "Spotify current-track error:",
      error.response?.data || error.code || error.message
    );

    res.status(500).json({
      ok: false,
      error: "Ошибка при получении трека"
    });
  }
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(publicDir, "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`+aura запущен на http://127.0.0.1:${PORT}`);
});
