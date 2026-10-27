import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";

// PUT /api/trips — rit invoeren of bijwerken (start/eind, D/N, privé)
// Invarianten:
//  - de kilometerstand kan over het jaar nooit dalen (teller is monotoon)
//  - privé heeft één autoritatieve bron: automatisch verschil tussen een start
//    en de laatste eindstand ervoor, geboekt op de dag van die eindstand.
//    Handmatig ingegeven privé (priveAuto=false, waarde > 0) wordt gerespecteerd.
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

  const startKmIn = b.startKm === undefined || b.startKm === null || b.startKm === "" ? null : Number(b.startKm);
  const endKmIn = b.endKm === undefined || b.endKm === null || b.endKm === "" ? null : Number(b.endKm);
  const priveKmIn = b.priveKm === undefined || b.priveKm === null || b.priveKm === "" ? null : Number(b.priveKm);
  const dayNightIn = b.dayNight === undefined ? null : (b.dayNight === "N" ? "N" : "D");

  // niet-meegestuurde velden behouden hun bestaande waarde (geen null-overschrijving)
  const startKm = b.startKm === undefined ? trip.startKm : startKmIn;
  const endKm = b.endKm === undefined ? trip.endKm : endKmIn;
  const priveKm = b.priveKm === undefined ? trip.priveKm : priveKmIn;
  const priveAuto = b.priveKm === undefined ? trip.priveAuto : false; // handmatig ingegeven privé
  // dag volledig gewist → D/N terug naar D
  const dagLeeg = startKm === null && endKm === null;
  const dayNight = dagLeeg && b.dayNight === undefined ? "D" : (b.dayNight === undefined ? trip.dayNight : (dayNightIn ?? "D"));

  // 7.4 invoervalidaties
  // A5: eindstand zonder eigen start is TOEGESTAAN als er een open start vóór deze dag
  // bestaat (rit over dag- of maandgrens; de beginstand wordt doorgevoerd via de brug).
  if (endKm !== null && startKm === null) {
    const openStart = await prisma.trip.findFirst({
      where: {
        yearId: yrow.id, startKm: { not: null }, endKm: null,
        OR: [{ month: month, day: { lt: day } }, { month: { lt: month } }],
      },
      orderBy: [{ month: "desc" }, { day: "desc" }],
    });
    if (!openStart)
      return NextResponse.json({ error: "Eindstand zonder startstand is niet toegestaan." }, { status: 422 });
  }
  if (startKm !== null && endKm !== null && endKm < startKm)
    return NextResponse.json({ error: "Eindstand moet groter of gelijk aan de startstand zijn." }, { status: 422 });

  // A1: teller is monotoon — geen enkele stand mag onder de vorige eindstand of boven de volgende startstand
  const lastEndBefore = async () => {
    const p = await prisma.trip.findFirst({
      where: {
        yearId: yrow.id, endKm: { not: null },
        OR: [{ month: month, day: { lt: day } }, { month: { lt: month } }],
      },
      orderBy: [{ month: "desc" }, { day: "desc" }],
    });
    return p && p.endKm !== null ? { trip: p, endKm: p.endKm } : null;
  };
  const firstStartAfter = async () => {
    const n = await prisma.trip.findFirst({
      where: {
        yearId: yrow.id, startKm: { not: null },
        OR: [{ month: month, day: { gt: day } }, { month: { gt: month } }],
      },
      orderBy: [{ month: "asc" }, { day: "asc" }],
    });
    return n && n.startKm !== null ? { trip: n, startKm: n.startKm } : null;
  };

  if (startKm !== null) {
    const prev = await lastEndBefore();
    if (prev && startKm < prev.endKm)
      return NextResponse.json(
        { error: `Kilometerstand kan niet dalen: de vorige eindstand was ${prev.endKm} (${String(prev.trip.day).padStart(2, "0")}/${String(prev.trip.month).padStart(2, "0")}).` },
        { status: 422 }
      );
    if (startKm < yrow.openingOdometer && !prev)
      return NextResponse.json({ error: `Stand moet minstens de openingsstand (${yrow.openingOdometer}) zijn.` }, { status: 422 });
  }
  if (endKm !== null) {
    const next = await firstStartAfter();
    if (next && endKm > next.startKm)
      return NextResponse.json(
        { error: `Kilometerstand kan niet dalen: de volgende startstand is ${next.startKm} (${String(next.trip.day).padStart(2, "0")}/${String(next.trip.month).padStart(2, "0")}).` },
        { status: 422 }
      );
  }
  if (yrow.closingOdometer !== null && endKm !== null && endKm > yrow.closingOdometer)
    return NextResponse.json({ error: "Stand hoger dan sluitstand." }, { status: 422 });

  const updated = await prisma.trip.update({
    where: { yearId_month_day: { yearId: yrow.id, month, day } },
    data: { dayNight, startKm, endKm, priveKm: priveKm ?? 0, priveAuto },
  });

  // A3: privé herberekenen bij elke mutatie van de keten — het automatisme is
  // altijd autoritatief (ook over geïmporteerde waarden heen).
  let priveBoeking: { month: number; day: number; priveKm: number } | null = null;

  // boek de privé van de eindstand vóór een start opnieuw bij een startwijziging
  const boekPriveVoorStart = async (startTrip: { month: number; day: number; startKm: number | null }) => {
    if (startTrip.startKm === null) return null;
    const p = await prisma.trip.findFirst({
      where: {
        yearId: yrow.id, endKm: { not: null },
        OR: [
          { month: startTrip.month, day: { lt: startTrip.day } },
          { month: { lt: startTrip.month } },
        ],
      },
      orderBy: [{ month: "desc" }, { day: "desc" }],
    });
    if (!p || p.endKm === null) return null;
    const diff = startTrip.startKm - p.endKm;
    const waarde = diff > 0 ? diff : 0;
    const u = await prisma.trip.update({ where: { id: p.id }, data: { priveKm: waarde, priveAuto: true } });
    return { month: u.month, day: u.day, priveKm: u.priveKm };
  };

  if (b.startKm !== undefined) {
    priveBoeking = await boekPriveVoorStart({ month, day, startKm });
    // start gewist → geen gat meer vóór deze start: privé op de vorige einddag naar 0
    // (tenzij een latere start die eindstand nog boekt)
    if (startKm === null) {
      const p = await prisma.trip.findFirst({
        where: {
          yearId: yrow.id, endKm: { not: null },
          OR: [{ month: month, day: { lt: day } }, { month: { lt: month } }],
        },
        orderBy: [{ month: "desc" }, { day: "desc" }],
      });
      if (p) {
        const volgende = await prisma.trip.findFirst({
          where: {
            yearId: yrow.id, startKm: { not: null },
            OR: [{ month: month, day: { gt: day } }, { month: { gt: month } }],
          },
          orderBy: [{ month: "asc" }, { day: "asc" }],
        });
        if (!volgende?.startKm)
          await prisma.trip.update({ where: { id: p.id }, data: { priveKm: 0, priveAuto: true } });
      }
    }
  }
  // bij een eindstandswijziging kan de boekingen van de VOLGENDE start wijzigen
  if (b.endKm !== undefined) {
    const next = await prisma.trip.findFirst({
      where: {
        yearId: yrow.id, startKm: { not: null },
        OR: [{ month: month, day: { gt: day } }, { month: { gt: month } }],
      },
      orderBy: [{ month: "asc" }, { day: "asc" }],
    });
    if (next) {
      const nb = await boekPriveVoorStart({ month: next.month, day: next.day, startKm: next.startKm });
      if (nb) priveBoeking = nb;
    }
  }
  // bij het wissen van de startstand vervalt de automatische privé vóór die start
  if (b.startKm !== undefined && startKm === null) {
    const p = await prisma.trip.findFirst({
      where: {
        yearId: yrow.id, endKm: { not: null }, priveAuto: true,
        OR: [{ month: month, day: { lt: day } }, { month: { lt: month } }],
      },
      orderBy: [{ month: "desc" }, { day: "desc" }],
    });
    if (p) {
      // herbereken: is er een latere start die deze eindstand nog boekt? anders 0
      const volgende = await prisma.trip.findFirst({
        where: {
          yearId: yrow.id, startKm: { not: null },
          OR: [{ month: month, day: { gt: day } }, { month: { gt: month } }],
        },
        orderBy: [{ month: "asc" }, { day: "asc" }],
      });
      if (!volgende?.startKm) await prisma.trip.update({ where: { id: p.id }, data: { priveKm: 0 } });
    }
  }

  return NextResponse.json({ ok: true, trip: updated, priveBoeking });
}
export const dynamic = "force-dynamic";
