import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/passwords";
import { signSession } from "../../lib/jwt";

type SignupInput = {
  email: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
};

export async function signup(input: SignupInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existing) {
    throw new Error("Email already in use");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      profile: {
        create: {},
      },
    },
    include: {
      profile: true,
    },
  });

  const token = signSession({ userId: user.id });

  return { user, token };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { profile: true },
  });

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const ok = await verifyPassword(input.password, user.passwordHash);

  if (!ok) {
    throw new Error("Invalid email or password");
  }

  const token = signSession({ userId: user.id });

  return { user, token };
}

export async function getMe(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      spotify: true,
    },
  });
}
