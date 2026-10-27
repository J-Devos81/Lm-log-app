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
  const [notStarted, setNotStarted] = useState(false);
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
    if (r.ok) { setData(await r.json()); setNotStarted(false); }
    else { setData(null); setNotStarted(true); }
  }, [router, year, ready]);

  useEffect(() => { load(); }, [load]);

  // B2: jaarkeuze ook in de URL zetten, zodat verversen/delen het jaar behoudt
  function wisselJaar(y: number) {
    setYear(y);
    window.history.replaceState(null, "", `/maand/${m}?y=${y}`);
  }
  useEffect(() => {
    if (ready) window.history.replaceState(null, "", `/maand/${m}?y=${year}`);
  }, [m, year, ready]);

  // A6: openingsstand-keten loopt over lege maanden heen tot de laatste eindstand (of de openingsstand)
  const openStand = (() => {
    if (!data) return null;
    for (let mm = m - 1; mm >= 1; mm--) {
      const days = data.months.find(x => x.month === mm)?.days ?? [];
      for (let i = days.length - 1; i >= 0; i--) if (days[i].endKm != null) return days[i].endKm;
    }
    return data.openingOdometer;
  })();

  const dagen = data?.months.find(x => x.month === m)?.days ?? [];
  const stat1 = data?.summary?.months.find(x => x.month === m)?.totalKm ?? 0;
  const stat2 = data?.summary?.months.find(x => x.month === m)?.priveKm ?? 0;
  const gereg = dagen.filter(d => d.total !== null).length;
  const prev = m === 1 ? { m: 12, y: year - 1 } : { m: m - 1, y: year };
  const next = m === 12 ? { m: 1, y: year + 1 } : { m: m + 1, y: year };

  async function quickEdit(day: number, patch: Partial<DayRow>) {
    const r = await fetch("/api/trips", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month: m, day, ...patch }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg(j.error ?? "Fout bij opslaan."); setTimeout(() => setMsg(null), 4000); }
    await load();
  }

  function exportCsv() {
    if (!data) return;
    const rows: string[][] = [["Dag", "D/N", "start", "eind", "totaal", "privé"]].concat(
      dagen.map(d => [String(d.day), d.dayNight, String(d.startKm ?? ""), String(d.endKm ?? ""), String(d.total ?? ""), String(d.priveKm ?? "")])
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(";")).join("\n")], { type: "text/csv" }));
    a.download = `Maandoverzicht_${MONTHS[m - 1]}_${year}.csv`;
    a.click();
  }

  // B4: getalinvoer die pas opslaat bij verlaten van het veld (blur/Enter) — geen PUT per toetsaanslag
  function NumCell({ value, onOpslaan, disabled }: { value: number | null; onOpslaan: (v: number | null) => void; disabled: boolean }) {
    const [txt, setTxt] = useState<string | null>(null); // null = niet in bewerking
    const cur = txt ?? (value != null ? String(value) : "");
    return (
      <input className="c og-serif og-num" inputMode="numeric" placeholder="–" disabled={disabled}
        value={cur}
        style={{ background: "transparent", border: "none", color: "inherit", textAlign: "center", width: "100%", opacity: value != null ? 1 : .45 }}
        onChange={e => setTxt(e.target.value.replace(/\D/g, ""))}
        onBlur={() => {
          if (txt === null) return;
          const v = txt === "" ? null : Number(txt);
          setTxt(null);
          if (v !== value) onOpslaan(v);
        }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    );
  }

  const Row = ({ d }: { d: DayRow }) => {
    const has = d.total !== null;
    return (
      <div className={"og-pill og-drow" + (has ? " hot" : d.weekend ? " wknd" : "")} title={d.dayNight === "N" ? "Nachtrit — eindstand geldt voor de dag erna (+1)" : undefined}>
        <select className="c og-serif" value={d.dayNight} disabled={!!data?.closed} aria-label="D/N"
          style={{ background: "transparent", border: "none", color: "inherit", fontWeight: 700, cursor: data?.closed ? "default" : "pointer", opacity: has || !d.weekend ? 1 : .62 }}
          onChange={e => quickEdit(d.day, { dayNight: e.target.value as "D" | "N" })}>
          <option value="D">D</option>
          <option value="N">N</option>
        </select>
        <div className="c og-serif dag">{fmtDate(d.day, m, year)}</div>
        <NumCell value={d.startKm} onOpslaan={v => quickEdit(d.day, { startKm: v })} disabled={!!data?.closed} />
        <div style={{ position: "relative", minWidth: 0 }}>
          <NumCell value={d.endKm} onOpslaan={v => quickEdit(d.day, { endKm: v })} disabled={!!data?.closed} />
          {d.dayNight === "N" && <span style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", fontSize: 9.5, fontWeight: 800, color: "#35c5ff", pointerEvents: "none" }}>+1</span>}
        </div>
        <div className="c og-num">{has ? nls(d.total ?? 0) : <span style={{ opacity: .45 }}>–</span>}</div>
        <div className="c og-num" style={{ color: d.priveKm ? "#ff8d84" : undefined }}>{d.priveKm ? nls(d.priveKm) : <span style={{ opacity: .45 }}>–</span>}</div>
      </div>
    );
  };

  return (
    <div className="bg-spoorweg">
      <div className="bg-scrim" style={{ background: "linear-gradient(165deg, rgba(4,8,18,.48) 0%, rgba(4,7,16,.26) 38%, rgba(3,6,14,.42) 66%, rgba(2,5,12,.62) 100%)" }} />
      <TopNav year={year} username={username} role={role} active="Maand overzicht" onYear={wisselJaar} />
      <div className="og-page">
        <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#cfd6e2", margin: "2px 0 6px 4px", textDecoration: "none", textShadow: "0 1px 3px rgba(0,0,0,.9)" }}>
          ← Terug naar <b style={{ color: "#ff8d84" }}>Jaaroverzicht</b>
        </a>

        <div className="og-titlebar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="og-tucbox"><img src="/logo.png" alt="TUC RAIL" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="og-bar-crumb">MAAND OVERZICHT · {year} · {(username || "…").toUpperCase()}</div>
            <h1 className="og-serif">{MONTHS[m - 1]} <span className="yr">{year}</span></h1>
          </div>
          <div className="og-bar-actions">
            <button className="og-btn" onClick={exportCsv}>⭳ CSV-export</button>
            <button className="og-btn" onClick={() => window.print()}>🖨 Afdrukken</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="og-fox" src="/fox.png" alt="System J" />
        </div>
        <div className="og-herosub"><b>KILOMETERSTAND 1 {MONTHS[m - 1]}:</b> &nbsp;{openStand != null ? nls(openStand) + " km" : "—"} &nbsp;·&nbsp; alle waarden worden server-side berekend.</div>

        {msg && <div className="msg-banner err" style={{ marginTop: 8 }}><b>{msg}</b></div>}

        {notStarted && (
          <div className="og-pill" style={{ margin: "18px 4px", padding: "26px 22px", textAlign: "center" }}>
            <div className="og-serif" style={{ fontSize: 20, marginBottom: 8 }}>Jaar {year} is nog niet gestart</div>
            <div style={{ fontSize: 13, color: "#cfd6e2", marginBottom: 14 }}>Vul eerst de openingsstand in op het jaaroverzicht; daarna verschijnt dit raster automatisch.</div>
            <a href={`/?y=${year}`} onClick={e => { e.preventDefault(); router.push(`/?y=${year}`); }} className="og-mbtn" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>← Naar het jaaroverzicht</a>
          </div>
        )}

        {!notStarted && (
          <>
            <div className="og-stats">
              <div className="og-pill og-stat">
                <div className="k">◔ MAANDTOTAAL</div>
                <div className="v og-num">{nls(stat1)}<small>km</small></div>
                <div className="s">{gereg} dagen geregistreerd</div>
              </div>
              <div className="og-pill og-stat">
                <div className="k">☾ PRIVÉ (INCL. CORRECTIE)</div>
                <div className="v og-num">{nls(stat2)}<small>km</small></div>
                <div className="s">automatisch + handmatig geboekt</div>
              </div>
              <div className="og-pill og-stat">
                <div className="k">▤ GEREGISTREERD</div>
                <div className="v og-num">{gereg}<small>dagen</small></div>
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
                  <span className="l">MAAND OVERZICHT {String(1).padStart(2, "0")}&thinsp;—&thinsp;{String(dagen.length).padStart(2, "0")} {MONTHS[m - 1]} · TABELWEERGAVE</span>
                  <span className="r">Weekends gemarkeerd · vul km-standen direct in</span>
                </div>
                <div className="og-tables">
                  <div className="og-dagkolom">
                    <div className="og-pill og-drow head"><div className="c og-serif">D/N</div><div className="c og-serif">DAG</div><div className="c og-serif">START</div><div className="c og-serif">EIND</div><div className="c og-serif">TOTAAL</div><div className="c og-serif">PRIVÉ</div></div>
                    {dagen.map(d => <Row key={d.day} d={d} />)}
                  </div>
                </div>
              </section>

              <aside className="og-aside">
                <div className="og-tot2">
                  <div className="stack">
                    <div className="og-pill lbl og-serif">WERK</div>
                    <div className="og-pill val og-num hot">{nls(stat1)}</div>
                  </div>
                  <div className="stack">
                    <div className="og-pill lbl og-serif">PRIVÉ</div>
                    <div className="og-pill val og-num">{nls(stat2)}</div>
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
          </>
        )}

        <footer className="og-footer">
          <span>DE Km-Log · TUC RAIL</span>
          <div className="r"><span>Server-side berekening · gevoelige gegevens</span><span>{MONTHS[m - 1]} {year}</span></div>
        </footer>
      </div>
    </div>
  );
}