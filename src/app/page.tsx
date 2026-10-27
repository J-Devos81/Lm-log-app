"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";

const MONTHS = ["Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December"];

interface MonthSum { month: number; name: string; totalKm: number; priveKm: number }
interface Summary {
  totalKm: number; priveKm: number; kmLimit: number; euroPerKm: number;
  verschil: number; status: "TOT LIMIET" | "OVER LIMIET"; resterend: number;
  teBetalen: number; teBetalenLabel: string; months: MonthSum[];
}
interface Overview {
  year: number; openingOdometer: number; closingOdometer: number | null; closed: boolean;
  months: { month: number; days: unknown[] }[]; summary: Summary; role: string;
  lastEndOfDecember: number | null;
}

const nls = (n: number) => n.toLocaleString("nl-BE");

export default function JaarOverzichtPage() {
  const router = useRouter();
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [queryYear, setQueryYear] = useState<number | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [notStarted, setNotStarted] = useState(false);
  const [correctie, setCorrectie] = useState("0");
  const [opening, setOpening] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("y");
      if (q && Number(q) >= 2024 && Number(q) <= 2060) { setQueryYear(Number(q)); setYear(Number(q)); }
    }
  }, []);

  const load = useCallback(async () => {
    const me = await fetch("/api/settings", { cache: "no-store" });
    if (me.status === 401) { router.push("/login"); return; }
    const mj = await me.json();
    setRole(mj.role ?? ""); setUsername(mj.username ?? ""); setCorrectie(String(mj.priveCorrectie ?? 0));
    const r = await fetch(`/api/year/${year}`, { cache: "no-store" });
    if (r.ok) { setData(await r.json()); setNotStarted(false); }
    else { setData(null); setNotStarted(true); }
  }, [router, year]);

  useEffect(() => { load(); }, [load]);

  async function startYear() {
    const r = await fetch(`/api/year/${year}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingOdometer: Number(opening.replace(/\./g, "")) }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Jaar ${year} gestart.` : (j.error ?? "Fout."));
    if (r.ok) { await load(); TopNavJump(year); }
  }
  function TopNavJump(y: number) { setYear(y); window.history.replaceState(null, "", `/?y=${y}`); }

  async function saveCorrectie() {
    const r = await fetch("/api/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priveCorrectie: Number(correctie.replace(",", ".")) }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Correctie opgeslagen." : (j.error ?? "Fout."));
    await load();
  }

  async function closeYear() {
    const closing = prompt(`Jaar afsluiten — sluitstand`, String(data?.lastEndOfDecember ?? ""));
    if (closing === null) return;
    const r = await fetch(`/api/year/${year}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closingOdometer: Number(closing.replace(/\./g, "")) }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? (j.message ?? "Jaar afgesloten.") : (j.error ?? "Fout."));
    await load();
  }

  function exportCsv() {
    if (!data) return;
    const rows = [["Maand", "Werk (km)", "Privé (km)"]].concat(
      data.summary.months.map(m => [m.name, String(m.totalKm), String(m.priveKm)]),
      [["TOTAAL", String(data.summary.totalKm), String(data.summary.priveKm)]]
    );
    const csv = rows.map(r => r.join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `Km-Log_${data.year}.csv`;
    a.click();
  }

  const s = data?.summary;
  const pct = s && s.kmLimit > 0 ? Math.min(100, Math.round(s.priveKm / s.kmLimit * 100)) : 0;

  if (notStarted) {
    return (
      <div className="bg-odometer">
        <div className="bg-scrim" />
        <TopNav year={year} username={username} role={role} active="Jaaroverzicht" onYear={y => setYear(y)} />
        <main className="page">
          {msg && <div className="msg-banner ok"><b>{msg}</b></div>}
          <div className="hero-card" style={{ display: "block", maxWidth: 620, margin: "80px auto" }}>
            <div className="kicker">JAAROVERZICHT · {year}</div>
            <h2 className="title" style={{ fontSize: 24 }}>Jaar {year} nog niet gestart</h2>
            <p className="subline" style={{ padding: 0 }}>
              Vul de <b>kilometerstand op 1 januari {year}</b> in om te beginnen; alle maanden worden automatisch gegenereerd.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={opening} inputMode="numeric" placeholder="Openingsstand"
                onChange={e => setOpening(e.target.value.replace(/\D/g, ""))}
                style={{ flex: 1, background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.16)", borderRadius: 9, padding: 13, fontSize: 15 }} />
              <button className="btn-main" style={{ margin: 0, width: "auto", padding: "0 26px", borderRadius: 9 }} onClick={startYear}>Jaar starten</button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-odometer">
      <div className="bg-scrim" />
      <TopNav year={year} username={username} role={role} active="Jaaroverzicht" onYear={y => { setYear(y); T2(y); }} />
      <main className="page">
        {msg && <div className="msg-banner ok"><b>{msg}</b></div>}
        <div className="hero-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-white" src="/logo.png" alt="TUC RAIL" />
          <div>
            <div className="kicker">JAAROVERZICHT · {username.toUpperCase()}</div>
            <h2 className="title">OVERZICHT TR Km <span className="jrt">{data ? data.year : year}</span></h2>
          </div>
          <div className="actions">
            <button className="btn-chip" onClick={exportCsv}>⭳ CSV-export</button>
            <button className="btn-chip" onClick={() => window.print()}>🖨 Afdrukken</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="fox" src="/fox.png" alt="System J" />
          </div>
        </div>
        <p className="subline">Van openingsstand tot privélimiet. <b>Alle waarden worden server-side berekend.</b></p>

        {s && (
          <div className="stat-row">
            <div className="stat-card">
              <div className="k">⟳ Totaal gereden</div>
              <div className="v">{nls(s.totalKm)} <small>km</small></div>
              <div className="d">12 maanden</div>
            </div>
            <div className="stat-card">
              <div className="k">Privé (incl. correctie)</div>
              <div className="v">{nls(s.priveKm)} <small>km</small></div>
              <div className="d">12 maanden</div>
            </div>
            <div className={"stat-card" + (s.verschil < 0 ? " red" : "")}>
              <div className="k">{s.verschil >= 0 ? "⤶ VERSCHIL · TOT LIMIET" : "⤶ VERSCHIL · OVER LIMIET"}</div>
              <div className="v">{nls(Math.abs(s.verschil))} <small>km</small></div>
              <div className="d">{s.verschil >= 0 ? "nog beschikbaar" : "overschrijding"}</div>
            </div>
            <div className={"stat-card" + (s.verschil < 0 ? " red" : "")}>
              <div className="k">$ TE BETALEN</div>
              <div className="v">€ {s.teBetalen.toFixed(2).replace(".", ",")}</div>
              <div className="d">{s.euroPerKm.toString().replace(".", ",")} EUR/km</div>
            </div>
          </div>
        )}

        <p className="subline"><b>PRIVÉLIMIET</b> &nbsp; Je jaarbudget in één oogopslag</p>
        {s && (
          <div style={{ maxWidth: 1330 }}>
            <div className="progress-bar"><i style={{ width: pct + "%" }} /></div>
            <div className="pipe-labels">
              <span>0 km</span>
              <span>{nls(s.priveKm)} / {nls(s.kmLimit)} km</span>
              <span>{nls(s.kmLimit)} km</span>
            </div>
          </div>
        )}

        <p className="subline" style={{ marginTop: 22 }}><b>MAANDOVERZICHT JAN — DEC</b> · tabelweergave · <span style={{ color: "var(--cyan)" }}>Openingststanden automatisch doorberekend</span></p>

        <div className="yr-tabel">
          <div>
            <div className="yr-head"><span>MAAND</span>
              <span style={{ color: "var(--red)" }}>WERK</span>
              <span style={{ color: "var(--red)" }}>PRIVÉ</span></div>
            {s && s.months.map(m => (
              <div className="yr-row" key={m.month}>
                <a href={`/maand/${m.month}?y=${data?.year ?? year}`} className="m" style={{ textDecoration: "none", color: "inherit" }}>
                  {MONTHS[m.month - 1]}
                </a>
                <div className={"w og-num" + (m.totalKm > 0 ? " over" : "")}>{nls(m.totalKm)}</div>
                <div className="p og-num">{nls(m.priveKm)}</div>
              </div>
            ))}
          </div>
          <div className="side-total">
            <div className="pill-title">totaal werk</div>
            <div className="pill-big red og-num">{s ? nls(s.totalKm) : "—"}</div>
            <div className="pill-title">totaal privé</div>
            <div className="pill-big og-num">{s ? nls(s.priveKm) : "—"}</div>
            <div className="pill-title">tot limiet</div>
            <div className="pill-big og-num">{s ? nls(s.kmLimit) : "—"}</div>
            <div className="footnote">Openingsstand op 1 januari: <b>{data ? nls(data.openingOdometer) : "—"} km</b></div>
            <div className="panel" style={compactPanel}>
              <div className="stat-card" style={{ borderRadius: 12, padding: 14 }}>
                <div className="k">Handmatige correctie — privé-jaartotaal bijsturen</div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input value={correctie} onChange={e => setCorrectie(e.target.value)}
                    style={{ width: 120, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)", color: "#fff", borderRadius: 8, padding: 9, fontSize: 14 }} />
                  <button className="btn-main" style={{ margin: 0, width: "auto", padding: "0 18px", borderRadius: 8 }} onClick={saveCorrectie}>✓ Correctie opslaan</button>
                </div>
              </div>
            </div>
            <div className="panel" style={{ ...compactPanel, padding: 14 }}>
              <div className="k" style={{ color: "var(--red)", letterSpacing: 1.5, fontWeight: 800, fontSize: 11 }}>JAARRECONCILIATIE</div>
              <h3 style={{ margin: "2px 0 8px", fontFamily: "Georgia, serif" }}>Jaar afsluiten</h3>
              <button className="btn-chip" onClick={closeYear}
                disabled={data?.closed} style={data?.closed ? { opacity: .5, cursor: "default" } : {}}>
                🔹 Afsluiting voorbereiden
              </button>
              {data?.closed && <small style={{ color: "var(--muted)", display: "block", marginTop: 6 }}>Jaar afgesloten op stand {data?.closingOdometer} km.</small>}
            </div>
          </div>
        </div>
      </main>
      <footer style={{ display: "flex", justifyContent: "space-between", padding: "8px 22px", fontSize: 12, color: "var(--muted)" }}>
        <span>DE Km-Log · TUC RAIL</span>
        <span>Server-side berekening · gevoelige gegevens · {year}</span>
      </footer>
    </div>
  );
}

function T2(y: number) { window.history.replaceState(null, "", `/?y=${y}`); }
const compactPanel: React.CSSProperties = { background: "rgba(20,24,30,.92)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: 0 };
