import { Router } from "express";
import axios from "axios";
import { requireAuth } from "../../middleware/auth";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";

const router = Router();

function ensureSpotifyEnv(res: any): boolean {
  if (
    !env.SPOTIFY_CLIENT_ID ||
    !env.SPOTIFY_CLIENT_SECRET ||
    !env.SPOTIFY_REDIRECT_URI
  ) {
    res.status(500).json({ message: "Spotify env is not configured" });
    return false;
  }
  return true;
}

router.get("/login", requireAuth, async (req, res) => {
  if (!ensureSpotifyEnv(res)) return;

  const scope = [
    "user-read-email",
    "user-read-currently-playing",
    "user-read-playback-state",
  ].join(" ");

  const state = req.user!.id;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.SPOTIFY_CLIENT_ID,
    scope,
    redirect_uri: env.SPOTIFY_REDIRECT_URI,
    state,
    show_dialog: "true",
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

router.get("/callback", requireAuth, async (req, res) => {
  if (!ensureSpotifyEnv(res)) return;

  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");

  if (!code || !state || state !== req.user!.id) {
    res.status(400).json({ message: "Invalid Spotify callback" });
    return;
  }

  try {
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.SPOTIFY_REDIRECT_URI,
    });

    const tokenResponse = await axios.post(
      "https://accounts.spotify.com/api/token",
      tokenParams.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(
              `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`
            ).toString("base64"),
        },
      }
    );

    const {
      access_token,
      refresh_token,
      expires_in,
    }: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    } = tokenResponse.data;

    const meResponse = await axios.get("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const spotifyUser = meResponse.data as {
      id: string;
      display_name?: string;
    };

    await prisma.spotifyAccount.upsert({
      where: { userId: req.user!.id },
      update: {
        spotifyUserId: spotifyUser.id,
        displayName: spotifyUser.display_name ?? null,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      },
      create: {
        userId: req.user!.id,
        spotifyUserId: spotifyUser.id,
        displayName: spotifyUser.display_name ?? null,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      },
    });

    res.redirect(`${env.CLIENT_URL}/connect-success`);
  } catch (error) {
    console.error("Spotify callback error:", error);
    res.redirect(`${env.CLIENT_URL}/connect-music?error=spotify_callback`);
  }
});

router.get("/status", requireAuth, async (req, res) => {
  const spotify = await prisma.spotifyAccount.findUnique({
    where: { userId: req.user!.id },
  });

  res.json({
    connected: Boolean(spotify),
    spotify: spotify
      ? {
          displayName: spotify.displayName,
          expiresAt: spotify.expiresAt,
        }
      : null,
  });
});

router.get("/current-track", requireAuth, async (req, res) => {
  const spotify = await prisma.spotifyAccount.findUnique({
    where: { userId: req.user!.id },
  });

  if (!spotify) {
    res.status(400).json({ message: "Spotify not connected" });
    return;
  }

  try {
    const response = await axios.get(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization: `Bearer ${spotify.accessToken}`,
        },
        validateStatus: () => true,
      }
    );

    if (response.status === 204) {
      res.json({ track: null });
      return;
    }

    if (response.status >= 400) {
      res.status(response.status).json({ message: "Failed to fetch track" });
      return;
    }

    const item = response.data?.item;

    if (!item) {
      res.json({ track: null });
      return;
    }

    res.json({
      track: {
        name: item.name,
        artist: item.artists?.map((a: any) => a.name).join(", "),
        album: item.album?.name,
        image: item.album?.images?.[0]?.url ?? null,
        url: item.external_urls?.spotify ?? null,
        durationMs: item.duration_ms ?? null,
        progressMs: response.data?.progress_ms ?? null,
        isPlaying: response.data?.is_playing ?? false,
      },
    });
  } catch (error) {
    console.error("Spotify track error:", error);
    res.status(500).json({ message: "Failed to fetch current track" });
  }
});

router.post("/disconnect", requireAuth, async (req, res) => {
  await prisma.spotifyAccount.deleteMany({
    where: { userId: req.user!.id },
  });

  res.json({ ok: true });
});

export default router;
