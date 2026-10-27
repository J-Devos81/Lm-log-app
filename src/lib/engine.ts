// Km-engine: server-side vertaling van het Excel-ENGINE tabblad.
// Volgorde is vast: kalender -> dagregistraties -> kettinglogica (state machine) -> aggregatie & limiet.

export type DayNight = "D" | "N";

export interface TripRow {
  month: number;
  day: number;
  dayNight: DayNight;
  startKm: number | null;
  endKm: number | null;
  priveKm: number;
}

export interface CalendarDay {
  day: number;
  date: string; // mm-dd-yy, like the Excel raster
  weekday: string; // NL weekdagnaam
  weekend: boolean;
}

export interface CalMonth {
  month: number;
  name: string;
  days: CalendarDay[];
}

const NL_MONTHS = [
  "JANUARI", "FEBRUARI", "MAART", "APRIL", "MEI", "JUNI",
  "JULI", "AUGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DECEMBER",
];
const NL_DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

const WEEKEND = ["zaterdag", "zondag"];

/** 6.1 Kalendergeneratie — weekendvlag zaterdag/zondag, schrikkeljaar-gewaar */
export function buildCalendar(year: number): CalMonth[] {
  if (year < 2024 || year > 2060) throw new RangeError("Jaar buiten bereik (2024-2060)");
  const out: CalMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const daysInMonth = new Date(year, m, 0).getDate(); // incl. schrikkeldag
    const days: CalendarDay[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, m - 1, d);
      const wd = NL_DAYS[dt.getDay()];
      days.push({
        day: d,
        date: fmtDate(dt),
        weekday: wd,
        weekend: wd === "zaterdag" || wd === "zondag",
      });
    }
    out.push({ month: m, name: NL_MONTHS[m - 1], days });
  }
  return out;
}

function fmtDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${String(d.getFullYear()).slice(2)}`;
}

/** 6.2 D/N-verschuiving: bij nachtrit einddatum = startdatum + 1 dag */
export function resolveEndDate(year: number, row: { month: number; day: number; dayNight: DayNight }): string {
  if (row.dayNight !== "N") return fmtDate(new Date(year, row.month - 1, row.day));
  return fmtDate(new Date(year, row.month - 1, row.day + 1));
}

/** 6.3 State machine — precies één state per rij */
export type TripState = 1 | 2 | 3;

export function resolveState(row: { startKm: number | null; endKm: number | null }): TripState {
  const has = (v: number | null) => v !== null && v !== undefined;
  const s = has(row.startKm), e = has(row.endKm);
  if (!s && !e) return 1; // open rij; carry-forward slaat deze dag over
  if (s && !e) return 2; // rit in behandeling
  return 3; // afgeronde rit
}

export function assertExactlyOneState(row: { startKm: number | null; endKm: number | null }): void {
  const s = row.startKm !== null, e = row.endKm !== null;
  if (e && !s) throw new Error("Eindstand zonder startstand is niet toegestaan.");
  // de andere combinaties zijn de geldige states 1-3
}

export function dayTotal(row: { startKm: number | null; endKm: number | null }): number | null {
  if (row.startKm === null || row.endKm === null) return null; // leeg zoals de formule
  return row.endKm - row.startKm;
}

/**
 * 6.3 Carry-forward over lege rijen: een beginstand op dag 1 met een eindstand
 * op dag 5 rekent de span af op de sluitdag; tussenliggende dagen blijven leeg.
 */
export function bridgeMultiDayTrip(year: number, month: number, rows: TripRow[]): TripRow[] {
  const out = rows.map(r => ({ ...r }));
  let carriedStart: number | null = null;
  let carriedUntilDay = -1;
  for (const r of out) {
    const st = resolveState(r);
    if (st === 2) {
      carriedStart = r.startKm;
      carriedUntilDay = r.day;
    } else if (st === 3) {
      if (carriedStart !== null && carriedUntilDay >= 0 && r.startKm === null) {
        // sluit een open rit af op de eerste rij die een eindstand geeft
        r.startKm = carriedStart;
      }
    }
  }
  void year; void month;
  return out;
}

export interface MonthSummary {
  month: number;
  name: string;
  totalKm: number;
  priveKm: number;
}

/**
 * 6.3b Carry-forward over het HELE jaar: een beginstand op bijv. 31/1 met een
 * eindstand op 3/2 rekent de span af op de sluitdag, ook over maandgrenzen heen.
 * rows moeten chronologisch gesorteerd zijn (maand, dag).
 */
export function bridgeYear(rows: TripRow[]): Map<number, Map<number, number | null>> {
  // resultaat: per (maand, dag) de effectieve startstand na brugging
  const out = new Map<number, Map<number, number | null>>();
  let carriedStart: number | null = null;
  for (const r of rows) {
    const st = resolveState(r);
    if (st === 2) {
      carriedStart = r.startKm;
    } else if (st === 3) {
      if (carriedStart !== null && r.startKm === null) {
        // sluit een open rit af op de eerste rij die een eindstand geeft
        const map = out.get(r.month) ?? new Map<number, number | null>();
        map.set(r.day, carriedStart);
        out.set(r.month, map);
        carriedStart = null;
      }
    }
  }
  return out;
}

export interface YearSummary {
  totalKm: number;
  priveKm: number;        // incl. correctieveld (AW9)
  kmLimit: number;
  euroPerKm: number;
  verschil: number;       // AV19: limiet - privé
  status: "TOT LIMIET" | "OVER LIMIET";
  resterend: number;      // bij TOT LIMIET
  teBetalen: number;      // AW29 bij OVER LIMIET: overschrijding * EUR/km
  teBetalenLabel: string; // TEBETALEN
  months: MonthSummary[];
}

/** 6.4 Aggregatie, limiet en te betalen */
export function yearSummary(opts: {
  months: { month: number; name: string; totalKm: number; priveKm: number }[];
  priveCorrectie: number;
  kmLimit: number;
  euroPerKm: number;
}): YearSummary {
  const totalKm = opts.months.reduce((a, m) => a + m.totalKm, 0);
  const priveKm = opts.months.reduce((a, m) => a + m.priveKm, 0) + opts.priveCorrectie;
  const verschil = Math.round(opts.kmLimit - priveKm);
  const over = verschil < 0;
  const absOver = Math.abs(verschil);
  return {
    totalKm,
    priveKm,
    kmLimit: opts.kmLimit,
    euroPerKm: opts.euroPerKm,
    verschil,
    status: over ? "OVER LIMIET" : "TOT LIMIET",
    resterend: over ? 0 : verschil,
    teBetalen: over ? Math.round(absOver * opts.euroPerKm * 100) / 100 : 0,
    teBetalenLabel: over ? "TEBETALEN" : "",
    months: opts.months,
  };
}

/** 6.5 Jaar afsluiten: reconciliatie openings- versus sluitstand */
export function checkYearClose(req: {
  openingOdometer: number;
  lastEndOfDecember: number | null;
  proposedClosing: number;
}): { ok: boolean; difference: number } {
  const expected = req.lastEndOfDecember;
  if (expected === null) return { ok: false, difference: req.proposedClosing - req.openingOdometer };
  return { ok: req.proposedClosing === expected, difference: req.proposedClosing - expected };
}
