"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav, { YEARS_ACCEPT } from "@/components/TopNav";

const MONTHS = ["JANUARI", "FEBRUARI", "MAART", "APRIL", "MEI", "JUNI", "JULI", "AUGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DECEMBER"];
const MONTHS_T = ["Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December"];

interface DayRow {
  day: number; date: string; weekday: string; weekend: boolean;
  dayNight: "D" | "N"; startKm: number | null; endKm: number | null;
  endDatum?: string; total: number | null; priveKm: number; state: number | null;
}
interface Overview {
  year: number; openingOdometer: number; closingOdometer: number | null; closed: boolean;
  months: { month: number; days: DayRow[] }[]; summary: { months: { month: number; totalKm: number; priveKm: number }[] }; role: string;
  lastEndOfDecember: number | null;
}

const nls = (n: number) => n.toLocaleString("nl-BE");

export default function MaandPage({ params }: { params: Promise<{ m: string }> }) {
  const router = useRouter();
  const [m, setM] = useState<number>(3);
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    (async () => {
      const p = await params;
      const mm = Number(p.m);
      if (mm >= 1 && mm <= 12) setM(mm);
      const q = new URLSearchParams(window.location.search).get("y");
      if (q && Number(q) >= 2024 && Number(q) <= 2060) setYear(Number(q));
    })();
  }, [params]);

  const load = useCallback(async () => {
    const me = await fetch("/api/settings", { cache: "no-store" });
    if (me.status === 401) { router.push("/login"); return; }
    const mj = await me.json();
    setUsername(mj.username ?? ""); setRole(mj.role ?? "");
    const r = await fetch(`/api/year/${year}`, { cache: "no-store" });
    if (r.ok) setData(await r.json()); else setData(null);
  }, [router, year]);

  useEffect(() => { load(); }, [load]);

  const month = data?.months.find(x => x.month === m);
  const prevMonth = m === 1 ? null : data?.months.find(x => x.month === m - 1);
  const lastEndPrev = useMemo(() => {
    if (!prevMonth) return null;
    for (let i = prevMonth.days.length - 1; i >= 0; i--) {
      const e = prevMonth.days[i].endKm;
      if (e !== null && e !== undefined) return e;
    }
    return null;
  }, [prevMonth]);

  async function save(day: number, patch: Partial<DayRow>) {
    const r = await fetch("/api/trips", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month: m, day, ...patch }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error ?? "Fout bij opslaan."); setTimeout(() => setMsg(null), 4000); }
    await load();
  }

  function exportCsv() {
    if (!month) return;
    const rows: string[][] = [["Dag", "D/N", "start", "eind", "totaal", "privé"]].concat(
      month.days.map(d => [String(d.day), d.dayNight, String(d.startKm ?? ""), String(d.endKm ?? ""), String(d.total ?? ""), String(d.priveKm ?? "")])
    );
    const csv = rows.map(r => r.join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `Maandraster_${MONTHS[m - 1]}_${year}.csv`;
    a.click();
  }

  const dagen = month?.days ?? [];
  const stat1 = data?.summary?.months.find(x => x.month === m)?.totalKm ?? 0;
  const stat2 = data?.summary?.months.find(x => x.month === m)?.priveKm ?? 0;
  const gereg = dagen.filter(d => d.total !== null).length;
  const openStand = m === 1 ? data?.openingOdometer : lastEndPrev;

  return (
    <div className="bg-spoorweg">
      <div className="bg-scrim" />
      <TopNav year={year} username={username} role={role} active="Maandraster"
        onYear={y => { setYear(y); }} />
      <main className="page">
        <a href="/" className="back-link">← Terug naar <b>Jaaroverzicht</b></a>
        <div className="hero-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-white" src="/logo.png" alt="TUC RAIL" />
          <div>
            <div className="kicker">MAANDRASTER · {year} · {username.toUpperCase()}</div>
            <h2 className="title">{MONTHS[m - 1]} <span className="jrt">{year}</span></h2>
          </div>
          <div className="actions">
            <button className="btn-chip" onClick={exportCsv}>⭳ CSV-export</button>
            <button className="btn-chip" onClick={() => window.print()}>🖨 Afdrukken</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="fox" src="/fox.png" alt="System J" />
          </div>
        </div>
        <p className="subline">KILOMETERSTAND 1 {MONTHS[m - 1]}: <b>{openStand !== null && openStand !== undefined ? nls(openStand) + " km" : "nog geen registraties in de voorgaande maand"}</b> · alle waarden worden serverside berekend.</p>

        {msg && <div className="msg-banner err"><b>{msg}</b></div>}

        <div className="stat-row">
          <div className="stat-card">
            <div className="k">⟳ Maandtotaal</div>
            <div className="v">{nls(stat1)} <small>km</small></div>
            <div className="d">{gereg} dagen geregistreerd</div>
          </div>
          <div className="stat-card">
            <div className="k">Privé (incl. correctie)</div>
            <div className="v">{nls(stat2)} <small>km</small></div>
            <div className="d">{nls(stat2)} km geregistreerd</div>
          </div>
          <div className="stat-card">
            <div className="k">☐ Geregistreerd</div>
            <div className="v">{gereg} <small>dagen</small></div>
            <div className="d">van {dagen.length} dagen · {dagen.length - gereg} resterend</div>
          </div>
        </div>

        <div className="raster-bar">
          <span className="month-nav">
            <a href={`/maand/${m === 1 ? 12 : m - 1}?y=${m === 1 ? year - 1 : year}`} style={{ textDecoration: "none", color: "inherit" }}>◀</a>
            <span style={{ minWidth: 104, textAlign: "center" }}>{MONTHS[m - 1]}</span>
            <a href={`/maand/${m === 12 ? 1 : m + 1}?y=${m === 12 ? year + 1 : year}`} style={{ textDecoration: "none", color: "inherit" }}>▶</a>
          </span>
          <span className="chip on">Weekend</span>
          <span className="chip">D → dag</span>
          <span className="chip">N → nacht (+1)</span>
          <button className="fill-fab" onClick={() => router.push("/invoeren")}>✎ Ik vul in</button>
        </div>

        <p className="subline"><b>DAGREGISTRATIE 01 — {String(dagen.length).padStart(2, "0")} {MONTHS[m - 1]}</b> · tabelweergave · <span>Weekends gemarkeerd · klik een dag om te bewerken</span></p>

        <div className="table-shell">
          <div>
            <div className="days-grid">
              <div className="days-grid-head">
                <div className="h"><span>Dag</span><span>D/N</span><span>Start</span><span>Eind</span><span>Totaal</span></div>
                <div className="h"><span>Dag</span><span>D/N</span><span>Start</span><span>Eind</span><span>Totaal</span></div>
              </div>
              {dagen.map((d, i) => {
                if (i >= Math.ceil(dagen.length / 2)) return null;
                return <DayRowC key={d.day} d={d} closed={!!data?.closed} onEdit={save} />;
              })}
              {dagen.slice(Math.ceil(dagen.length / 2)).map(d => (
                <DayRowC key={d.day} d={d} closed={!!data?.closed} onEdit={save} />
              ))}
            </div>
          </div>
          <div />
          <div className="side-total">
            <div className="pill-title">Maand totaal</div>
            <div className="two-pills">
              <div>
                <div className="pill-title" style={{ borderTop: "2px solid var(--red)", fontWeight: 800 }}>WERK</div>
                <div className="pill-big red">{nls(stat1)}</div>
              </div>
              <div>
                <div className="pill-title" style={{ borderTop: "2px solid var(--cyan)" }}>PRIVÉ</div>
                <div className="pill-big">{nls(stat2)}</div>
              </div>
            </div>
            <div className="pill-title">kies een maand</div>
            <div className="month-picker">
              {MONTHS_T.map((mn, i) => (
                <a key={mn} href={`/maand/${i + 1}?y=${year}`}
                  className={i + 1 === m ? "current" : ""}>{mn.toUpperCase()}</a>
              ))}
            </div>
            <div className="prev-next">
              <a href={`/maand/${m === 1 ? 12 : m - 1}?y=${m === 1 ? year - 1 : year}`} className="btn-chip" style={{ textDecoration: "none", textAlign: "center" }}>
                ◀ {m === 1 ? "DECEMBER" : MONTHS_T[m - 2].toUpperCase()}
              </a>
              <a href={`/maand/${m === 12 ? 1 : m + 1}?y=${m === 12 ? year + 1 : year}`} className="btn-chip" style={{ textDecoration: "none", textAlign: "center" }}>
                {m === 12 ? "JANUARI" : MONTHS_T[m].toUpperCase()} ▶
              </a>
            </div>
            <div className="footnote">
              <span className="dot">●</span> geregistreerd · <b>za / zo</b> weekend · {gereg}/{dagen.length} dagen
            </div>
            <div className="footnote">
              Kilometerstand op 1 {m === 12 ? "januari" : MONTHS_T[m].toLowerCase()} wordt automatisch herberekend
            </div>
          </div>
        </div>
      </main>
      <footer style={{ position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", padding: "8px 22px", fontSize: 12, color: "var(--muted)" }}>
        <span>DE Km-Log · TUC RAIL</span>
        <span>Server-side berekening · gevoelige gegevens · {MONTHS[m - 1]} {year}</span>
      </footer>
    </div>
  );
}

function DayRowC(props: { d: DayRow; closed: boolean; onEdit: (d: number, p: Partial<DayRow>) => Promise<void> }) {
  const d = props.d;
  const wd = d.weekday.slice(0, 2);
  return (
    <div className={"day-row" + (d.weekend ? " weekendr" : "")}>
      <span className="dagnum">{String(d.day).padStart(2, "0")}<small>{wd}</small></span>
      <select className="dn" value={d.dayNight} disabled={props.closed} aria-label="D/N"
        style={{ background: "transparent", color: d.dayNight === "N" ? "#ff8f93" : "#c2ccd8", border: "none", fontWeight: 700, cursor: props.closed ? "default" : "pointer" }}
        onChange={e => props.onEdit(d.day, { dayNight: e.target.value as "D" | "N" })}>
        <option value="D">D</option>
        <option value="N">N</option>
      </select>
      <input className="stand" inputMode="numeric" placeholder="—" value={d.startKm ?? ""} disabled={props.closed}
        onChange={e => { const v = e.target.value.replace(/\D/g, ""); props.onEdit(d.day, { startKm: v === "" ? null : Number(v) }); }} />
      <input className="stand" inputMode="numeric" placeholder="—" value={d.endKm ?? ""} disabled={props.closed}
        onChange={e => { const v = e.target.value.replace(/\D/g, ""); props.onEdit(d.day, { endKm: v === "" ? null : Number(v) }); }} />
      <span className="tot">{d.total !== null ? nls(d.total) : "—"}</span>
    </div>
  );
}
