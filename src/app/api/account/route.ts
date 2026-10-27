import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";

// DELETE /api/account — account met alle data in één transactie wissen (cascade)
export async function DELETE(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  if (b.confirm !== user.username)
    return NextResponse.json({ error: "Typ je gebruikersnaam ter bevestiging." }, { status: 400 });

  await prisma.$transaction([
    prisma.passwordResetRequest.deleteMany({ where: { userId: user.id } }),
    prisma.user.delete({ where: { id: user.id } }), // cascade: settings, years, trips
    prisma.registrationRequest.deleteMany({ where: { username: user.username } }),
  ]);

  const res = NextResponse.json({ ok: true, message: "Account en alle data zijn gewist." });
  res.headers.append("Set-Cookie", `kmlog_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  return res;
}
export const dynamic = "force-dynamic";
