import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser, currentUserAdmin } from "@/lib/session";

// GET /api/settings — eigen instellingen (limiet/tarief voor het overzicht)
export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  const admin = user.role === "ADMIN";
  return NextResponse.json({
    kmLimit: user.settings?.kmLimit ?? 14000,
    euroPerKm: user.settings?.euroPerKm ?? 0.175,
    priveCorrectie: user.settings?.priveCorrectie ?? 0,
    role: user.role,
  });
}

// PUT /api/settings — app-brede instellingen (admin)
export async function PUT(req: NextRequest) {
  const user = await currentUserAdmin(req);
  if (!user) return NextResponse.json({ error: "Alleen de admin." }, { status: 403 });
  const { kmLimit, euroPerKm } = await req.json().catch(() => ({}));
  if (kmLimit !== undefined && (!Number.isFinite(kmLimit) || kmLimit <= 0))
    return NextResponse.json({ error: "Ongeldige km-limiet." }, { status: 400 });
  if (euroPerKm !== undefined && (!Number.isFinite(euroPerKm) || euroPerKm < 0))
    return NextResponse.json({ error: "Ongeldig tarief." }, { status: 400 });

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {
      kmLimit: kmLimit !== undefined ? Math.round(kmLimit) : user.settings?.kmLimit ?? 14000,
      euroPerKm: euroPerKm !== undefined ? Number(euroPerKm) : user.settings?.euroPerKm ?? 0.175,
    },
    create: { userId: user.id, kmLimit: kmLimit !== undefined ? Math.round(kmLimit) : 14000, euroPerKm: euroPerKm !== undefined ? Number(euroPerKm) : 0.175 },
  });
  return NextResponse.json({ ok: true });
}
export const dynamic = "force-dynamic";
