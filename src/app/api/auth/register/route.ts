import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";

// POST /api/auth/register — registratie-aanvraag (status PENDING, publiek)
export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || typeof username !== "string" || username.trim().length < 3)
    return NextResponse.json({ error: "Gebruikersnaam minstens 3 tekens." }, { status: 400 });
  if (!password || typeof password !== "string" || password.length < 8)
    return NextResponse.json({ error: "Wachtwoord minstens 8 tekens." }, { status: 400 });

  const uname = username.trim();
  const nameTaken =
    (await prisma.user.findUnique({ where: { username: uname } })) ||
    (await prisma.registrationRequest.findFirst({ where: { username: uname, status: "PENDING" } }));
  if (nameTaken)
    return NextResponse.json({ error: "Gebruikersnaam al in gebruik of in de wachtrij." }, { status: 409 });

  const totalUsers = await prisma.user.count();
  const totalPending = await prisma.registrationRequest.count({ where: { status: "PENDING" } });

  // Allereerste aanvraag ooit = admin, direct goedgekeurd zonder tussenkomst.
  if (totalUsers === 0 && totalPending === 0) {
    const admin = await prisma.user.create({
      data: {
        username: uname,
        passwordHash: hashPassword(password),
        role: "ADMIN",
        status: "ACTIVE",
        settings: { create: {} },
      },
    });
    return NextResponse.json({ role: "ADMIN", approvedImmediately: true, userId: admin.id });
  }

  await prisma.registrationRequest.create({
    data: { username: uname, passwordHash: hashPassword(password) },
  });
  return NextResponse.json({ message: "Registratie ingestuurd; de admin keurt je aanvraag goed." });
}

export const dynamic = "force-dynamic";
