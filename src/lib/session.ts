// Sessie-hulp voor API-routes: leest en schrijft de HTTP-only sessiecookie.
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { verifySession, signSession } from "./auth";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "kmlog_session";

export async function readSession(req: NextRequest): Promise<number | null> {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function currentUser(req: NextRequest) {
  const uid = await readSession(req);
  if (!uid) return null;
  const user = await prisma.user.findUnique({ where: { id: uid }, include: { settings: true } });
  if (!user || user.status !== "ACTIVE") return null;
  return user;
}

export async function currentUserAdmin(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function setSessionCookie(res: Response, userId: number): Promise<Response> {
  const out = new Response(res.body, res);
  out.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${signSession(userId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${14 * 24 * 3600}`
  );
  return out;
}

export async function clearSessionCookie(res: Response): Promise<Response> {
  const out = new Response(res.body, res);
  out.headers.append("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  return out;
}
