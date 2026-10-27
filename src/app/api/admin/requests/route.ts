import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUserAdmin } from "@/lib/session";

// GET /api/admin/requests — wachtrij: registraties en resetaanvragen
export async function GET(req: NextRequest) {
  const admin = await currentUserAdmin(req);
  if (!admin) return NextResponse.json({ error: "Niet toegestaan." }, { status: 403 });

  const regs = await prisma.registrationRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
  const resets = await prisma.passwordResetRequest.findMany({
    where: { status: "PENDING" },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    registrations: regs.map(r => ({ id: r.id, kind: "REGISTRATION", username: r.username, createdAt: r.createdAt })),
    resets: resets.map(r => ({ id: r.id, kind: "RESET", username: r.user.username, createdAt: r.createdAt })),
  });
}
export const dynamic = "force-dynamic";
