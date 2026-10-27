import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import {
  buildCalendar, bridgeMultiDayTrip, dayTotal, resolveState, resolveEndDate, yearSummary, type TripRow,
} from "@/lib/engine";

type Ctx = { params: Promise<{ year: string }> };

const MONTH_NAMES = ["", "JANUARI", "FEBRUARI", "MAART", "APRIL", "MEI", "JUNI", "JULI", "AUGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DECEMBER"];

// GET /api/year/{year} — maandraster data + summary in één call
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  const year = Number((await ctx.params).year);
  if (!Number.isInteger(year) || year < 2024 || year > 2060)
    return NextResponse.json({ error: "Jaar 2024-2060 vereist." }, { status: 400 });

  const yrow = await prisma.year.findUnique({
    where: { userId_year: { userId: user.id, year } },
    include: { trips: { orderBy: [{ month: "asc" }, { day: "asc" }] } },
  });
  if (!yrow) return NextResponse.json({ error: "Jaar niet gestart." }, { status: 404 });

  const calendar = buildCalendar(year);
  const tripsByMonth = new Map<number, TripRow[]>();
  const priveByDay = new Map<number, Map<number, number>>();
  for (const t of yrow.trips) {
    const arr = tripsByMonth.get(t.month) ?? [];
    arr.push({
      month: t.month, day: t.day, dayNight: (t.dayNight as "D" | "N") ?? "D",
      startKm: t.startKm ?? null, endKm: t.endKm ?? null, priveKm: t.priveKm ?? 0,
    });
    tripsByMonth.set(t.month, arr);
    priveByDay.set(t.month, (priveByDay.get(t.month) ?? new Map()).set(t.day, t.priveKm ?? 0));
  }

  // maandraster laden: kalender + ritten, weekendvlag -> zwart
  const months = calendar.map(cm => {
    const rows = tripsByMonth.get(cm.month) ?? [];
    const bridged = bridgeMultiDayTrip(year, cm.month, rows);
    return {
      month: cm.month, name: cm.name,
      days: cm.days.map(d => {
        const t = bridged.find(r => r.day === d.day);
        return {
          day: d.day, date: d.date, weekday: d.weekday, weekend: d.weekend,
          dayNight: t?.dayNight ?? "D",
          startKm: t?.startKm ?? null,
          endKm: t?.endKm ?? null,
          endDatum: t ? resolveEndDate(year, t) : "",
          total: t ? dayTotal(t) : null,
          priveKm: t?.priveKm ?? 0,
          state: t ? resolveState(t) : null,
        };
      }),
    };
  });

  const monthSums = months.map(m => ({
    month: m.month,
    name: m.name,
    totalKm: m.days.reduce((a, d) => a + (d.total ?? 0), 0),
    priveKm: m.days.reduce((a, d) => a + (d.priveKm ?? 0), 0),
  }));

  const summary = yearSummary({
    months: monthSums,
    priveCorrectie: user.settings?.priveCorrectie ?? 0,
    kmLimit: user.settings?.kmLimit ?? 14000,
    euroPerKm: user.settings?.euroPerKm ?? 0.175,
  });

  return NextResponse.json({
    year, openingOdometer: yrow.openingOdometer, closingOdometer: yrow.closingOdometer,
    closed: yrow.closingOdometer !== null,
    months, summary, role: user.role,
    lastEndOfDecember: lastEndDec(months),
  });
}

function lastEndDec(months: { month: number; days: { day: number; endKm: number | null }[] }[]): number | null {
  const dec = months.find(m => m.month === 12);
  if (!dec) return null;
  for (let i = dec.days.length - 1; i >= 0; i--) {
    const e = dec.days[i].endKm;
    if (e !== null && e !== undefined) return e;
  }
  return null;
}

// POST /api/year/{year} — jaar starten met openingsstand
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  const year = Number((await ctx.params).year);
  const body = await req.json().catch(() => ({}));
  const opening = Number(body.openingOdometer);
  if (!Number.isInteger(year) || year < 2024 || year > 2060)
    return NextResponse.json({ error: "Jaar 2024-2060 vereist." }, { status: 400 });
  if (!Number.isInteger(opening) || opening < 0)
    return NextResponse.json({ error: "O openingsstand vereist." }, { status: 400 });

  const exists = await prisma.year.findUnique({ where: { userId_year: { userId: user.id, year } } });
  if (exists) return NextResponse.json({ error: "Jaar bestaat al." }, { status: 409 });

  const created = await prisma.year.create({
    data: { userId: user.id, year, openingOdometer: opening },
  });
  // kalenderdag rijen voor het hele jaar Scheiding per dag: uniek (yearId, month, day)
  const rows: { yearId: number; month: number; day: number }[] = [];
  const cal = buildCalendar(year);
  for (const m of cal) for (const d of m.days) rows.push({ yearId: created.id, month: m.month, day: d.day });
  await prisma.trip.createMany({ data: rows });
  return NextResponse.json({ ok: true });
}

// PUT /api/year/{year} — jaar afsluiten (openings-/sluitstandscontrole)
export async function PUT(req: NextRequest, ctx: Ctx) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  const year = Number((await ctx.params).year);
  const yrow = await prisma.year.findUnique({
    where: { userId_year: { userId: user.id, year } },
    include: { trips: true },
  });
  if (!yrow) return NextResponse.json({ error: "Jaar niet gestart." }, { status: 404 });
  if (yrow.closingOdometer !== null)
    return NextResponse.json({ error: "Jaar is al afgesloten." }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const closing = Number(body.closingOdometer);
  if (!Number.isInteger(closing))
    return NextResponse.json({ error: "Sluitstand vereist." }, { status: 400 });

  // laatste eindstand in december
  const dec = yrow.trips.filter(t => t.month === 12 && t.endKm !== null).sort((a, b) => a.day - b.day);
  const lastEnd = dec.length ? dec[dec.length - 1].endKm! : null;
  const expected = lastEnd ?? yrow.openingOdometer;
  if (closing !== expected)
    return NextResponse.json(
      { error: `Reconciliatie: sluitstand (${closing}) sluit niet aan op verwachte stand (${expected}).` },
      { status: 422 }
    );

  await prisma.year.update({ where: { id: yrow.id }, data: { closingOdometer: closing } });
  void MONTH_NAMES;
  return NextResponse.json({ ok: true, message: "Jaar afgesloten; geen wijzigingen meer mogelijk." });
}
export const dynamic = "force-dynamic";
