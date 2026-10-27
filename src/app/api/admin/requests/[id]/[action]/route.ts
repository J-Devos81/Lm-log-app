import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUserAdmin } from "@/lib/session";
import { makeCodeHash, randomCode, hashPassword } from "@/lib/auth";

// POST /api/admin/requests/{id}/{approve|reject}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const admin = await currentUserAdmin(req);
  if (!admin) return NextResponse.json({ error: "Niet toegestaan." }, { status: 403 });

  const { id, action } = await params;
  const rowId = Number(id);
  if (action !== "approve" && action !== "reject")
    return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });

  // Registration first
  const reg = await prisma.registrationRequest.findUnique({ where: { id: rowId } });
  if (reg && reg.status === "PENDING") {
    if (action === "reject") {
      await prisma.registrationRequest.update({ where: { id: rowId }, data: { status: "REJECTED", decidedAt: new Date() } });
      return NextResponse.json({ ok: true, message: "Registratie afgewezen." });
    }
    // approve: aanmaken of activeren
    const existing = await prisma.user.findUnique({ where: { username: reg.username } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
      await prisma.registrationRequest.update({ where: { id: rowId }, data: { status: "APPROVED", decidedAt: new Date() } });
      return NextResponse.json({ ok: true, message: `${reg.username} is geactiveerd.` });
    }
    // opruimen zodat de naam vrij is: oude REJECTED-aanvragen zelfde naam wissen
    await prisma.registrationRequest.deleteMany({ where: { username: reg.username, status: "REJECTED" } });
    await prisma.user.create({
      data: {
        username: reg.username,
        passwordHash: reg.passwordHash,
        role: "USER",
        status: "ACTIVE",
        settings: { create: {} },
      },
    });
    await prisma.registrationRequest.update({ where: { id: rowId }, data: { status: "APPROVED", decidedAt: new Date() } });
    return NextResponse.json({ ok: true, message: `${reg.username} is goedgekeurd en kan inloggen.` });
  }

  // Reset second
  const reset = await prisma.passwordResetRequest.findUnique({ where: { id: rowId }, include: { user: true } });
  if (reset && reset.status === "PENDING") {
    if (action === "reject") {
      await prisma.passwordResetRequest.delete({ where: { id: rowId } });
      return NextResponse.json({ ok: true, message: "Reset afgewezen; wachtwoord ongewijzigd." });
    }
    const code = randomCode(6);
    await prisma.passwordResetRequest.update({
      where: { id: rowId },
      data: { status: "APPROVED", codeHash: makeCodeHash(code), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });
    // code één keer tonen; admin geeft mondeling door
    return NextResponse.json({ ok: true, code, message: `Herstelcode voor ${reset.user.username}: ${code} (30 min geldig).` });
  }

  return NextResponse.json({ error: "Aanvraag niet (meer) gevonden." }, { status: 404 });
}
export const dynamic = "force-dynamic";
