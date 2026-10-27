import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, makeCodeHash, randomCode, hashPassword } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";

// POST /api/auth/login
// Onderbreekt de wachtwoordstap zodra er een goedgekeurde, geldige reset voor de naam loopt.
export async function POST(req: NextRequest) {
  const { username, password, resetCode } = await req.json().catch(() => ({}));
  if (!username || typeof username !== "string")
    return NextResponse.json({ error: "Gebruikersnaam vereist." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { username: username.trim() } });

  // admin-gebruikersnaam met vaste herstelcode-step
  if (user && user.status === "ACTIVE" && !resetCode) {
    const pendingReset = await prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, status: "APPROVED", expiresAt: { gt: new Date() } },
    });
    if (pendingReset) return NextResponse.json({ step: "RESET_CODE" });
  }

  if (!user) {
    // geen user maar wel een registratie-aanvraag -> neutrale melding
    const pending = await prisma.registrationRequest.findFirst({ where: { username: username.trim() } });
    if (pending)
      return NextResponse.json(
        { error: "Je account is nog niet goedgekeurd door de admin." },
        { status: 403 }
      );
    return NextResponse.json({ error: "Ongeldige inloggegevens." }, { status: 401 });
  }

  if (user.status === "PENDING")
    return NextResponse.json({ error: "Je account is nog niet goedgekeurd door de admin." }, { status: 403 });
  if (user.status === "REJECTED")
    return NextResponse.json({ error: "Je registratie is afgewezen." }, { status: 403 });

  // Goedgekeurde gebruikersreset binnen vervaltijd: 6-cijferige code vragen.
  const approvedReset = await prisma.passwordResetRequest.findFirst({
    where: { userId: user.id, status: "APPROVED", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (approvedReset && !resetCode)
    return NextResponse.json({ step: "RESET_CODE" });

  if (approvedReset && resetCode) {
    if (resetCode !== String(resetCode).trim() || resetCode.trim().length !== 6)
      return NextResponse.json({ error: "6-cijferige code vereist." }, { status: 400 });
    if (makeCodeHash(String(resetCode).trim()) !== approvedReset.codeHash)
      return NextResponse.json({ error: "Code ongeldig of verlopen; vraag een nieuwe aan." }, { status: 403 });
    // correct -> stap naar nieuw wachtwoord
    return NextResponse.json({ step: "NEW_PASSWORD", username: user.username });
  }

  if (!password || !verifyPassword(password, user.passwordHash))
    return NextResponse.json({ error: "Ongeldige inloggegevens." }, { status: 401 });

  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, role: user.role },
  });
  return setSessionCookie(res, user.id);
}

// POST /api/auth/reset/complete — nieuw wachtwoord instellen (na correcte code of vaste admin-code)
export async function PUT(req: NextRequest) {
  const { username, resetCode, newPassword } = await req.json().catch(() => ({}));
  if (!username || !resetCode || !newPassword || newPassword.length < 8)
    return NextResponse.json({ error: "Vul alle velden in; wachtwoord minstens 8 tekens." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (!user) return NextResponse.json({ error: "Onbekende gebruiker." }, { status: 404 });

  const adminCode = process.env.ADMIN_RECOVERY_CODE;
  if (user.role === "ADMIN") {
    // vaste admin-code uit configuratie (versleuteld in env), of een goedgekeurde temp-code
    const fixedOk = adminCode && makeCodeHash(String(resetCode)) === makeCodeHash(adminCode);
    const temp = await prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, status: "APPROVED", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    const tempOk = temp && makeCodeHash(String(resetCode)) === temp.codeHash;
    if (!fixedOk && !tempOk)
      return NextResponse.json({ error: "Vaste code ongeldig of verlopen." }, { status: 403 });

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword) },
    });
    if (temp) {
      await prisma.passwordResetRequest.update({ where: { id: temp.id }, data: { status: "USED" } });
    }
    console.warn(`[audit] admin-reset gelukt voor userId=${user.id}`);
    const res = NextResponse.json({ ok: true, message: "Wachtwoord gewijzigd; je bent direct ingelogd." });
    return setSessionCookie(res, user.id);
  }

  const pending = await prisma.passwordResetRequest.findFirst({
    where: { userId: user.id, status: "APPROVED", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!pending)
    return NextResponse.json({ error: "Herstelcode ongeldig of verlopen; doe een nieuwe aanvraag." }, { status: 403 });
  if (makeCodeHash(String(resetCode)) !== pending.codeHash)
    return NextResponse.json({ error: "Herstelcode ongeldig of verlopen; doe een nieuwe aanvraag." }, { status: 403 });

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword) } }),
    prisma.passwordResetRequest.update({ where: { id: pending.id }, data: { status: "USED" } }),
  ]);

  const res = NextResponse.json({ ok: true, message: "Wachtwoord gewijzigd; je bent direct ingelogd." });
  return setSessionCookie(res, user.id);
}

export const dynamic = "force-dynamic";
