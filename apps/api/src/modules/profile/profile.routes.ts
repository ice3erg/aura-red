import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().max(100).optional(),
  age: z.number().int().min(18).max(120).nullable().optional(),
  city: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

router.get("/me", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.user!.id },
  });

  res.json({ profile });
});

router.patch("/me", requireAuth, async (req, res) => {
  try {
    const data = updateProfileSchema.parse(req.body);

    const profile = await prisma.profile.upsert({
      where: { userId: req.user!.id },
      update: {
        name: data.name,
        age: data.age ?? undefined,
        city: data.city,
        bio: data.bio,
        avatarUrl: data.avatarUrl ?? undefined,
      },
      create: {
        userId: req.user!.id,
        name: data.name,
        age: data.age ?? undefined,
        city: data.city,
        bio: data.bio,
        avatarUrl: data.avatarUrl ?? undefined,
      },
    });

    res.json({ profile });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update profile";
    res.status(400).json({ message });
  }
});

export default router;
