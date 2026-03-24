import { Router } from "express";
import { z } from "zod";
import { login, signup, getMe } from "./auth.service";
import { requireAuth } from "../../middleware/auth";
import { clearSessionCookie, setSessionCookie } from "../../utils/cookies";

const router = Router();

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

router.post("/signup", async (req, res) => {
  try {
    const data = authSchema.parse(req.body);
    const result = await signup(data);

    setSessionCookie(res, result.token);

    res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        profile: result.user.profile,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sign up";
    res.status(400).json({ message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const data = authSchema.parse(req.body);
    const result = await login(data);

    setSessionCookie(res, result.token);

    res.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        profile: result.user.profile,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to log in";
    res.status(400).json({ message });
  }
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await getMe(req.user!.id);

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      profile: user.profile,
      spotifyConnected: Boolean(user.spotify),
    },
  });
});

export default router;
