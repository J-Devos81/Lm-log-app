"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";

const MONTHS = ["JANUARI", "FEBRUARI", "MAART", "APRIL", "MEI", "JUNI", "JULI", "AUGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DECEMBER"];
const MONTHS_T = ["Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December"];

interface DayRow {
  day: number; date: string; weekday: string; weekend: boolean;
  dayNight: "D" | "N"; startKm: number | null; endKm: number | null;
  total: number | null; priveKm: number;
}
interface Overview {
  year: number; openingOdometer: number; closed: boolean;
  months: { month: number; days: DayRow[] }[];
  summary: { months: { month: number; totalKm: number; priveKm: number }[] };
}

const nls = (n: number) => n.toLocaleString("nl-BE");
const fmtDate = (day: number, mo: number, yr: number) =>
  `${String(day).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${yr}`;

export default function MaandPage({ params }: { params: Promise<{ m: string }> }) {
  const router = useRouter();
  const [m, setM] = useState(3);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await params;
      const mm = Number(p.m);
      if (mm >= 1 && mm <= 12) setM(mm);
      const q = new URLSearchParams(window.location.search).get("y");
      if (q && Number(q) >= 2024 && Number(q) <= 2060) setYear(Number(q));
      setReady(true);
    })();
  }, [params]);

  const load = useCallback(async () => {
    if (!ready) return;
    const me = await fetch("/api/settings", { cache: "no-store" });
    if (me.status === 401) { router.push("/login"); return; }
    const mj = await me.json();
    setUsername(mj.username ?? ""); setRole(mj.role ?? "");
    const r = await fetch(`/api/year/${year}`, { cache: "no-store" });
    setData(r.ok ? await r.json() : null);
  }, [router, year, ready]);

  useEffect(() => { load(); }, [load]);

  const month = data?.months.find(x => x.month === m);
  const prevMonth = m === 1 ? null : data?.months.find(x => x.month === m - 1);
  let lastEndPrev: number | null = null;
  if (prevMonth) for (let i = prevMonth.days.length - 1; i >= 0; i--) { const e = prevMonth.days[i].endKm; if (e != null) { lastEndPrev = e; break; } }
  const openStand = m === 1 ? data?.openingOdometer : lastEndPrev;

  const dagen = month?.days ?? [];
  const stat1 = data?.summary?.months.find(x => x.month === m)?.totalKm ?? 0;
  const stat2 = data?.summary?.months.find(x => x.month === m)?.priveKm ?? 0;
  const gereg = dagen.filter(d => d.total !== null).length;
  const prev = m === 1 ? { m: 12, y: year - 1 } : { m: m - 1, y: year };
  const next = m === 12 ? { m: 1, y: year + 1 } : { m: m + 1, y: year };
  const wds = ["zo", "ma", "di", "wo", "do", "vr", "za"];

  async function quickEdit(day: number, patch: Partial<DayRow>) {
    const r = await fetch("/api/trips", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month: m, day, ...patch }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg(j.error ?? "Fout bij opslaan."); setTimeout(() => setMsg(null), 4000); }
    await load();
  }

  function exportCsv() {
    if (!month) return;
    const rows: string[][] = [["Dag", "D/N", "start", "eind", "totaal", "privé"]].concat(
      month.days.map(d => [String(d.day), d.dayNight, String(d.startKm ?? ""), String(d.endKm ?? ""), String(d.total ?? ""), String(d.priveKm ?? "")])
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(";")).join("\n")], { type: "text/csv" }));
    a.download = `Maandraster_${MONTHS[m - 1]}_${year}.csv`;
    a.click();
  }

  const Row = ({ d }: { d: DayRow }) => {
    const has = d.total !== null;
    return (
      <div className={"og-pill og-drow" + (has ? " hot" : d.weekend ? " wknd" : "")}>
        <select className="c og-serif" value={d.dayNight} disabled={!!data?.closed} aria-label="D/N"
          style={{ background: "transparent", border: "none", color: "inherit", fontWeight: 700, cursor: data?.closed ? "default" : "pointer", opacity: has || !d.weekend ? 1 : .62 }}
          onChange={e => quickEdit(d.day, { dayNight: e.target.value as "D" | "N" })}>
          <option value="D">D</option>
          <option value="N">N</option>
        </select>
        <div className="c og-serif dag">{fmtDate(d.day, m, year)}</div>
        <input className="c og-serif" inputMode="numeric" placeholder="–" value={d.startKm ?? ""} disabled={!!data?.closed}
          style={{ background: "transparent", border: "none", color: "inherit", textAlign: "center", width: "100%", opacity: has ? 1 : .45 }}
          onChange={e => { const v = e.target.value.replace(/\D/g, ""); quickEdit(d.day, { startKm: v === "" ? null : Number(v) }); }} />
        <input className="c og-serif" inputMode="numeric" placeholder="–" value={d.endKm ?? ""} disabled={!!data?.closed}
          style={{ background: "transparent", border: "none", color: "inherit", textAlign: "center", width: "100%", opacity: has ? 1 : .45 }}
          onChange={e => { const v = e.target.value.replace(/\D/g, ""); quickEdit(d.day, { endKm: v === "" ? null : Number(v) }); }} />
        <div className="c og-serif">{has ? nls(d.total ?? 0) : <span style={{ opacity: .45 }}>–</span>}</div>
      </div>
    );
  };

  return (
    <div className="bg-spoorweg">
      <div className="bg-scrim" style={{ background: "linear-gradient(165deg, rgba(4,8,18,.48) 0%, rgba(4,7,16,.26) 38%, rgba(3,6,14,.42) 66%, rgba(2,5,12,.62) 100%)" }} />
      <TopNav year={year} username={username} role={role} active="Maandraster" onYear={setYear} />
      <div className="og-page">
        <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#cfd6e2", margin: "2px 0 6px 4px", textDecoration: "none", textShadow: "0 1px 3px rgba(0,0,0,.9)" }}>
          ← Terug naar <b style={{ color: "#ff8d84" }}>Jaaroverzicht</b>
        </a>

        <div className="og-titlebar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="og-tucbox"><img src="/logo.png" alt="TUC RAIL" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="og-bar-crumb">MAANDRASTER · {year} · {(username || "…").toUpperCase()}</div>
            <h1 className="og-serif">{MONTHS[m - 1]} <span className="yr">{year}</span></h1>
          </div>
          <div className="og-bar-actions">
            <button className="og-btn" onClick={exportCsv}>⭳ CSV-export</button>
            <button className="og-btn" onClick={() => window.print()}>🖨 Afdrukken</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="og-fox" src="/fox.png" alt="" />
        </div>
        <div className="og-herosub"><b>KILOMETERSTAND 1 {MONTHS[m - 1]}:</b> &nbsp;{openStand != null ? nls(openStand) + " km" : "—"} &nbsp;·&nbsp; alle waarden worden server-side berekend.</div>

        {msg && <div className="msg-banner err" style={{ marginTop: 8 }}><b>{msg}</b></div>}

        <div className="og-stats">
          <div className="og-pill og-stat">
            <div className="k">◔ MAANDTOTAAL</div>
            <div className="v og-serif">{nls(stat1)}<small>km</small></div>
            <div className="s">{gereg} dagen geregistreerd</div>
          </div>
          <div className="og-pill og-stat">
            <div className="k">☾ PRIVÉ (INCL. CORRECTIE)</div>
            <div className="v og-serif">{nls(stat2)}<small>km</small></div>
            <div className="s">{nls(stat2)} km geregistreerd</div>
          </div>
          <div className="og-pill og-stat">
            <div className="k">▤ GEREGISTREERD</div>
            <div className="v og-serif">{gereg}<small>dagen</small></div>
            <div className="s">van {dagen.length} dagen · {dagen.length - gereg} resterend</div>
          </div>
        </div>

        <div className="og-tool">
          <span className="og-pill og-selchip">
            <a href={`/maand/${prev.m}?y=${prev.y}`}>◀</a>
            <span className="og-serif" style={{ fontSize: 16, letterSpacing: 1 }}>{MONTHS[m - 1]}</span>
            <a href={`/maand/${next.m}?y=${next.y}`}>▶</a>
          </span>
          <span className="og-pill og-fchip on">Weekend</span>
          <span className="og-pill og-fchip">D→dag</span>
          <span className="og-pill og-fchip">N→nacht (+1)</span>
          <span className="sp" />
          <button className="og-mbtn" onClick={() => router.push(`/invoeren?terug=${encodeURIComponent(`/maand/${m}?y=${year}`)}`)}>✎ Ik invullen</button>
        </div>

        <div className="og-main">
          <section style={{ minWidth: 0 }}>
            <div className="og-zone-h">
              <span className="l">MAANDOVERZICHT {String(1).padStart(2, "0")}&thinsp;—&thinsp;{String(dagen.length).padStart(2, "0")} {MONTHS[m - 1]} · TABELWEERGAVE</span>
              <span className="r">Weekends gemarkeerd · vul km-standen direct in</span>
            </div>
            <div className="og-tables">
              <div className="og-dagkolom">
                <div className="og-pill og-drow head"><div className="c og-serif">D/N</div><div className="c og-serif">DAG</div><div className="c og-serif">START</div><div className="c og-serif">EIND</div><div className="c og-serif">TOTAAL</div></div>
                {dagen.map(d => <Row key={d.day} d={d} />)}
              </div>
            </div>
          </section>

          <aside className="og-aside">
            <div className="og-tot2">
              <div className="stack">
                <div className="og-pill lbl og-serif">WERK</div>
                <div className="og-pill val og-serif hot">{nls(stat1)}</div>
              </div>
              <div className="stack">
                <div className="og-pill lbl og-serif">PRIVÉ</div>
                <div className="og-pill val og-serif">{nls(stat2)}</div>
              </div>
            </div>
            <div className="og-pill og-mlbl og-serif">kies een maand</div>
            <div className="month-picker" style={{ margin: "0 4px" }}>
              {MONTHS_T.map((mn, i) => (
                <a key={mn} href={`/maand/${i + 1}?y=${year}`} className={i + 1 === m ? "current" : ""}>{mn.toUpperCase()}</a>
              ))}
            </div>
            <div className="og-pnrow">
              <a className="og-pill og-pn" href={`/maand/${prev.m}?y=${prev.y}`}>◀&nbsp; {MONTHS_T[prev.m - 1].toUpperCase()}</a>
              <a className="og-pill og-pn" href={`/maand/${next.m}?y=${next.y}`}>{MONTHS_T[next.m - 1].toUpperCase()} &nbsp;▶</a>
            </div>
            <div className="og-pill og-leg"><span className="dot" /> geregistreerd &nbsp;·&nbsp; <span style={{ color: "#ff8d84", fontWeight: 700 }}>za / zo</span> weekend &nbsp;·&nbsp; {gereg} / {dagen.length} dagen</div>
            <div className="og-pill og-leg">Kilometerstand 1 {MONTHS_T[next.m - 1].toLowerCase()} wordt automatisch herberekend</div>
          </aside>
        </div>

        <footer className="og-footer">
          <span>DE Km-Log · TUC RAIL</span>
          <div className="r"><span>Server-side berekening · gevoelige gegevens</span><span>{MONTHS[m - 1]} {year}</span></div>
        </footer>
      </div>
    </div>
  );
}
