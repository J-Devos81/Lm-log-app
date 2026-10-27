import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import { assertExactlyOneState } from "@/lib/engine";

// PUT /api/trips — rit invoeren of bijwerken (start/eind, D/N, privé)
export async function PUT(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const year = Number(b.year), month = Number(b.month), day = Number(b.day);
  if (![year, month, day].every(Number.isInteger))
    return NextResponse.json({ error: "Jaar/maand/dag vereist." }, { status: 400 });

  const yrow = await prisma.year.findUnique({ where: { userId_year: { userId: user.id, year } } });
  if (!yrow) return NextResponse.json({ error: "Jaar niet gestart." }, { status: 404 });
  if (yrow.closingOdometer !== null)
    return NextResponse.json({ error: "Jaar is afgesloten; ritten kunnen niet meer gewijzigd worden." }, { status: 409 });

  const trip = await prisma.trip.findUnique({ where: { yearId_month_day: { yearId: yrow.id, month, day } } });
  if (!trip) return NextResponse.json({ error: "Dag bestaat niet (kalender)." }, { status: 404 });

  const startKm = b.startKm === undefined || b.startKm === null || b.startKm === "" ? null : Number(b.startKm);
  const endKm = b.endKm === undefined || b.endKm === null || b.endKm === "" ? null : Number(b.endKm);
  const priveKm = b.priveKm === undefined || b.priveKm === null || b.priveKm === "" ? (trip.priveKm ?? 0) : Number(b.priveKm);
  const dayNight = b.dayNight === "N" ? "N" : "D";

  // 7.4 invoervalidaties
  try {
    assertExactlyOneState({ startKm, endKm });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 422 });
  }
  if (startKm !== null && endKm !== null && endKm < startKm)
    return NextResponse.json({ error: "Eindstand moet groter of gelijk aan de startstand zijn." }, { status: 422 });
  if (dayNight === "N" && startKm !== null && endKm !== null) {
    const dt = new Date(year, month - 1, 0).getDate();
    void dt;
    // einddatum mag maximaal één dag later (logische model), de standen blijven op de startdag-rij
  }
  if (startKm !== null && startKm < yrow.openingOdometer)
    return NextResponse.json({ error: `Standen moeten minstens de openingsstand (${yrow.openingOdometer}) zijn.` }, { status: 422 });
  if (yrow.closingOdometer !== null && endKm !== null && endKm > yrow.closingOdometer)
    return NextResponse.json({ error: "Stand hoger dan sluitstand." }, { status: 422 });
  if (priveKm !== null && startKm !== null && endKm !== null && priveKm > endKm - startKm)
    return NextResponse.json({ error: "Privé-kilometers mogen het dagtotaal niet overschrijden." }, { status: 422 });

  const updated = await prisma.trip.update({
    where: { yearId_month_day: { yearId: yrow.id, month, day } },
    data: { dayNight, startKm, endKm, priveKm: priveKm ?? 0 },
  });
  return NextResponse.json({ ok: true, trip: updated });
}
export const dynamic = "force-dynamic";
