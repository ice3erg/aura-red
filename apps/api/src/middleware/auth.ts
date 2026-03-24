import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { verifySession } from "../lib/jwt";
import { prisma } from "../lib/prisma";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.cookies?.[env.COOKIE_NAME];

    if (!token) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const payload = verifySession(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
}
