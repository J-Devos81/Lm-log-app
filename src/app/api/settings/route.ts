import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser, currentUserAdmin } from "@/lib/session";

// GET /api/settings — eigen instellingen (limiet/tarief voor het overzicht)
export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  const admin = user.role === "ADMIN";
  return NextResponse.json({
    username: user.username,
    kmLimit: user.settings?.kmLimit ?? 14000,
    euroPerKm: user.settings?.euroPerKm ?? 0.175,
    priveCorrectie: user.settings?.priveCorrectie ?? 0,
    role: user.role,
  });
}

// PUT /api/settings — km-limiet/tarief: admin; privé-correctie: iedereen (eigen account)
export async function PUT(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Alleen ingelogde gebruikers." }, { status: 403 });
  const { kmLimit, euroPerKm, priveCorrectie } = await req.json().catch(() => ({}));
  if (kmLimit !== undefined || euroPerKm !== undefined) {
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Alleen de admin." }, { status: 403 });
    if (kmLimit !== undefined && (!Number.isFinite(kmLimit) || kmLimit <= 0))
      return NextResponse.json({ error: "Ongeldige km-limiet." }, { status: 400 });
    if (euroPerKm !== undefined && (!Number.isFinite(euroPerKm) || euroPerKm < 0))
      return NextResponse.json({ error: "Ongeldig tarief." }, { status: 400 });
  }
  const upd: { kmLimit?: number; euroPerKm?: number; priveCorrectie?: number } = {};
  if (kmLimit !== undefined) upd.kmLimit = Math.round(kmLimit);
  if (euroPerKm !== undefined) upd.euroPerKm = Number(euroPerKm);
  if (priveCorrectie !== undefined && Number.isFinite(priveCorrectie)) upd.priveCorrectie = Number(priveCorrectie);
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: upd,
    create: { userId: user.id, kmLimit: upd.kmLimit ?? 14000, euroPerKm: upd.euroPerKm ?? 0.175, priveCorrectie: upd.priveCorrectie ?? 0 },
  });
  return NextResponse.json({ ok: true });
}
export const dynamic = "force-dynamic";
