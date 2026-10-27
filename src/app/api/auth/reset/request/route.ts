import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, clearSessionCookie } from "@/lib/session";

// POST /api/auth/reset/request — wachtwoordherstel-aanvraag (status PENDING)
export async function POST(req: NextRequest) {
  const { username } = await req.json().catch(() => ({}));
  if (!username || typeof username !== "string")
    return NextResponse.json({ error: "Gebruikersnaam vereist." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { username: username.trim() } });

  // Neutrale respons: niet onthullen of de account bestaat.
  if (user) {
    const existing = await prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, status: "PENDING" },
    });
    if (!existing && user.status === "ACTIVE") {
      await prisma.passwordResetRequest.create({ data: { userId: user.id } });
    }
  }
  return NextResponse.json({
    message: "Aanvraag verstuurd. Wacht op goedkeuring van de admin; je ontvangt de code van hem.",
  });
}

// DELETE /api/auth/logout alike: account verwijderen zit op eigen route
export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  return clearSessionCookie(res);
}

export const dynamic = "force-dynamic";
void SESSION_COOKIE;
