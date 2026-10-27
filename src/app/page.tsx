"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const YEARS = Array.from({ length: 2060 - 2024 + 1 }, (_, i) => 2024 + i);

interface DayRow {
  day: number; date: string; weekday: string; weekend: boolean;
  dayNight: "D" | "N"; startKm: number | null; endKm: number | null;
  endDatum?: string;
  total: number | null; priveKm: number; state: number | null;
}
interface MonthBlock { month: number; name: string; days: DayRow[]; }
interface Summary {
  totalKm: number; priveKm: number; kmLimit: number; euroPerKm: number;
  verschil: number; status: "TOT LIMIET" | "OVER LIMIET"; resterend: number;
  teBetalen: number; teBetalenLabel: string;
}
interface Overview {
  year: number; openingOdometer: number; closingOdometer: number | null; closed: boolean;
  months: MonthBlock[]; summary: Summary; role: string; lastEndOfDecember: number | null;
}

type ME = React.ChangeEvent<HTMLInputElement | HTMLSelectElement>;

export default function HomePage() {
  const router = useRouter();
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [data, setData] = useState<Overview | null>(null);
  const [role, setRole] = useState<string>("");
  const [openPanel, setOpenPanel] = useState<false | true>(false);
  const [newYear, setNewYear] = useState<number | null>(null);
  const [opening, setOpening] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const me = await fetch("/api/settings", { cache: "no-store" });
      if (me.status === 401) { router.push("/login"); return; }
      const mj = await me.json();
      setRole(mj.role ?? "");
      const yr = newYear ?? new Date().getFullYear();
      const r = await fetch(`/api/year/${yr === year ? year : yr}`, { cache: "no-store" });
      if (r.ok) setData(await r.json());
      else setData(null);
    } finally {
      setBusy(false);
    }
  }, [router, year, newYear]);

  useEffect(() => { load(); }, [load]);

  async function save(month: number, day: number, patch: Partial<DayRow>) {
    if (!data) return;
    const r = await fetch("/api/trips", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, day, ...patch }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error ?? "Fout bij opslaan."); setTimeout(() => setMsg(null), 4000); }
    await load();
  }

  async function startYear() {
    if (!newYear || opening === "") return;
    const r = await fetch(`/api/year/${newYear}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingOdometer: Number(opening) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error ?? "Fout."); setTimeout(() => setMsg(null), 4000); return; }
    setYear(newYear); setNewYear(null); await load();
  }

  async function closeYear() {
    const closing = prompt(`Jaar ${data?.year} afsluiten: vul de sluitstand`, String(data?.lastEndOfDecember ?? ""));
    if (closing === null) return;
    const r = await fetch(`/api/year/${year}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closingOdometer: Number(closing) }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? (j.message ?? "Jaar gesloten.") : (j.error ?? "Fout."));
    await load();
  }

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }

  async function deleteAccount() {
    const r = await fetch("/api/account", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: delConfirm }),
    });
    if (r.ok) router.push("/login");
    else setMsg("Bevestiging onjuist.");
  }

  const isMobile = useMemo(() => typeof window !== "undefined" && window.innerWidth < 768, [data]);

  if (!data) {
    return (
      <div className="body-odometer" style={{ minHeight: "100vh" }}>
        <TopBar year={year} role={role} onYear={y => { setYear(y); setNewYear(y); }} onLogout={logout} onDel={setDelOpen} />
        <main className="page">
          {msg && <div className="panel"><b>{msg}</b></div>}
          <div className="panel">
            <h2 className="britannic">Jaar {year} nog niet gestart</h2>
            <p>Vul de <b>kilometerstand op 1 januari {year}</b> (openingsstand) in om te beginnen:</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input className="secret-panel input" style={{ padding: 10, borderRadius: 6, border: "1px solid #bbb" }}
                inputMode="numeric" placeholder="Openingsstand" value={opening}
                onChange={(e: ME) => setOpening(e.target.value.replace(/\D/g, ""))} />
              <button onClick={startYear} style={{ padding: "10px 18px", border: "none", borderRadius: 6, background: "var(--cyan)", fontWeight: 700, cursor: "pointer" }}>
                Jaar starten
              </button>
            </div>
            {busy && <small>laden…</small>}
          </div>
        </main>
        {delOpen && <DeleteDialog confirm={delConfirm} setConfirm={setDelConfirm} onClose={() => setDelOpen(false)} onDelete={deleteAccount} />}
      </div>
    );
  }

  const s = data.summary;
  return (
    <div className="body-spoorweg" style={{ minHeight: "100vh" }}>
      <TopBar year={year} role={role} closed={data.closed}
        onYear={y => { setYear(y); setNewYear(y); }} onLogout={logout} onDel={setDelOpen}
        onCloseYear={closeYear} />
      <main className="page">
        {msg && <div className="panel"><b>{msg}</b></div>}
        {data.months.map(m => (
          <MonthRaster key={m.month} m={m} closed={data.closed} isMobile={!!isMobile} onEdit={save} />
        ))}

        <div className="year-summary" id="jaaroverzicht">
          <h3 className="britannic">JAAROVERZICHT {year}</h3>
          <table>
            <tbody>
              <tr><td className="label">Totaal ritten (km)</td><td className="calc">{fmt(s.totalKm)}</td></tr>
              <tr><td className="label">Privé-km (incl. correctie)</td><td className="calc">{fmt(s.priveKm)}</td></tr>
              <tr><td className="label">Jaarlimiet</td><td className="calc">{fmt(s.kmLimit)}</td></tr>
              <tr><td className="label">VERSCHIL (limiet – privé)</td>
                <td className={"calc " + (s.verschil < 0 ? "status-over" : "status-ok")}>{fmt(s.verschil)}</td></tr>
              <tr><td className="label">Status</td>
                <td className={"calc " + (s.status === "OVER LIMIET" ? "status-over" : "status-ok")}>
                  {s.status === "TOT LIMIET" ? `TOT LIMIET — resteert ${fmt(s.resterend)} km` : "OVER LIMIET"}</td></tr>
              {s.status === "OVER LIMIET" && (
                <tr><td className="label">TEBETALEN ({(s.euroPerKm).toFixed(3).replace(".", ",")} €/km)</td><td className="calc status-over">€ {s.teBetalen.toFixed(2).replace(".", ",")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
      <button className="mobile-btn-fab" onClick={() => router.push("/invoeren")}>Km invoeren</button>
      {delOpen && <DeleteDialog confirm={delConfirm} setConfirm={setDelConfirm} onClose={() => setDelOpen(false)} onDelete={deleteAccount} />}
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("nl-BE");
}

function TopBar(props: {
  year: number; role: string; closed?: boolean;
  onYear: (y: number) => void; onLogout: () => void; onDel: (o: boolean) => void; onCloseYear?: () => void;
}) {
  return (
    <div className="topbar">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/logo.png" alt="logo" />
      <h1 className="britannic">Km-Log App</h1>
      <select value={props.year} onChange={e => props.onYear(Number(e.target.value))} aria-label="JAAR SELECT">
        {YEARS.map(y => <option key={y} value={y}>JAAR {y}</option>)}
      </select>
      <span className="spacer" />
      {props.role === "ADMIN" && (<Link href="/admin" style={{ color: "#9fe", fontWeight: 700, marginRight: 4 }}>Admin-beheer</Link>)}
      {props.onCloseYear && props.role === "ADMIN" && !props.closed && (
        <button onClick={props.onCloseYear}>Jaar afsluiten</button>
      )}
      <button onClick={props.onLogout}>Afmelden</button>
      <img className="fox" src="/fox.png" alt="" onClick={() => props.onDel(true)} style={{ cursor: "pointer" }} title="Account verwijderen" />
    </div>
  );
}

function MonthRaster(props: { m: MonthBlock; closed: boolean; isMobile: boolean; onEdit: (m: number, d: number, p: Partial<DayRow>) => Promise<void>; }) {
  const { m } = props;
  const monthTot = m.days.reduce((a, d) => a + (d.total ?? 0), 0);
  const priveTot = m.days.reduce((a, d) => a + (d.priveKm ?? 0), 0);

  if (props.isMobile) {
    return (
      <section>
        <div className="month-head" style={{ background: "var(--charcoal)" }}>
          <h2>{m.name}</h2>
        </div>
        {m.days.map(d => (
          <DayCard key={d.day} d={d} closed={props.closed}
            onEdit={p => props.onEdit(m.month, d.day, p)} />
        ))}
        <div className="month-total" style={{ padding: "8px 12px", background: "var(--charcoal)", color: "#fff" }}>
          Totale maand: <b>{fmt(monthTot)} km</b> &nbsp;|&nbsp; Privé: <b>{fmt(priveTot)} km</b>
        </div>
      </section>
    );
  }

  return (
    <section className="month-block">
      <div className="month-head">
        <h2>{m.name}</h2>
        <span className="open-stand">D/N | startDatum | eind datum | start | eind | totaal | totaal (privé km)</span>
      </div>
      <table className="raster">
        <thead>
          <tr>
            <th aria-label="Kilometerstand">D/N</th><th>startDatum</th><th>eind datum</th>
            <th>start</th><th>eind</th><th>totaal</th><th>totaal (privé km)</th>
          </tr>
        </thead>
        <tbody>
          {m.days.map(d => (
            <tr key={d.day} className={d.weekend ? "weekend" : ""}>
              <td style={{ width: 56 }}>
                <select value={d.dayNight} disabled={props.closed}
                  onChange={e => props.onEdit(m.month, d.day, { dayNight: e.target.value as "D" | "N" })}>
                  <option value="D">D</option><option value="N">N</option>
                </select>
              </td>
              <td>{d.date}</td>
              <td className="calc">{d.dayNight === "N" ? (d.endDatum ?? "") : ""}</td>
              <td style={{ width: 90 }}>
                <input inputMode="numeric" value={d.startKm ?? ""} disabled={props.closed}
                  onChange={e => { const v = e.target.value.replace(/\D/g, ""); props.onEdit(m.month, d.day, { startKm: v === "" ? null : Number(v) }); }} />
              </td>
              <td style={{ width: 90 }}>
                <input inputMode="numeric" value={d.endKm ?? ""} disabled={props.closed}
                  onChange={e => { const v = e.target.value.replace(/\D/g, ""); props.onEdit(m.month, d.day, { endKm: v === "" ? null : Number(v) }); }} />
              </td>
              <td className="calc">{d.total !== null ? fmt(d.total) : ""}</td>
              <td style={{ width: 90 }}>
                <input id={"prive-" + m.month + "-" + d.day} inputMode="decimal" value={d.priveKm || ""} disabled={props.closed}
                  onChange={e => {
                    const v = parseFloat(e.target.value.replace(",", "."));
                    props.onEdit(m.month, d.day, { priveKm: isNaN(v) ? 0 : v });
                  }} />
              </td>
            </tr>
          ))}
          <tr className="month-total">
            <td colSpan={5}>Totale maand</td><td>{fmt(monthTot)}</td><td>{fmt(priveTot)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function DayCard(props: { d: DayRow; closed: boolean; onEdit: (p: Partial<DayRow>) => Promise<void> }) {
  const d = props.d;
  return (
    <div className={"day-card" + (d.weekend ? " weekend" : "")}>
      <div className="row"><b>{d.date}</b><span>{d.weekday}</span></div>
      <div className="row">
        <label>D/N</label>
        <select value={d.dayNight} disabled={props.closed} onChange={e => props.onEdit({ dayNight: e.target.value as "D" | "N" })}>
          <option value="D">Dag</option><option value="N">Nacht</option>
        </select>
      </div>
      <div className="row"><label>start</label><input inputMode="numeric" value={d.startKm ?? ""} disabled={props.closed} onChange={e => { const v = e.target.value.replace(/\D/g, ""); props.onEdit({ startKm: v === "" ? null : Number(v) }); }} /></div>
      <div className="row"><label>eind</label><input inputMode="numeric" value={d.endKm ?? ""} disabled={props.closed} onChange={e => { const v = e.target.value.replace(/\D/g, ""); props.onEdit({ endKm: v === "" ? null : Number(v) }); }} /></div>
      <div className="row"><label>totaal</label><span className="calc">{d.total !== null ? fmt(d.total) : ""}</span></div>
      <div className="row"><label>privé</label><input inputMode="decimal" value={d.priveKm || ""} disabled={props.closed} onChange={e => { const v = parseFloat(e.target.value.replace(",", ".")); props.onEdit({ priveKm: isNaN(v) ? 0 : v }); }} /></div>
    </div>
  );
}

function DeleteDialog(props: {
  confirm: string; setConfirm: (s: string) => void; onClose: () => void; onDelete: () => void;
}) {
  return (
    <div className="secret-panel" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 100 }}>
      <div className="panel" style={{ maxWidth: 420, width: "90%" }}>
        <h2 style={{ color: "#b00020" }}>Account verwijderen</h2>
        <p>Alles gaat verloren: je ritten, jaren en instellingen. Typ je <b>gebruikersnaam</b> ter bevestiging.</p>
        <input value={props.confirm} onChange={e => props.setConfirm(e.target.value)}
          placeholder="gebruikersnaam" style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #bbb" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button style={{ flex: 1, padding: 10, border: "none", borderRadius: 6, background: "var(--brown)", color: "#fff", fontWeight: 700, cursor: "pointer" }} onClick={props.onClose}>Annuleren</button>
          <button style={{ flex: 1, padding: 10, border: "none", borderRadius: 6, background: "#b00020", color: "#fff", fontWeight: 700, cursor: "pointer" }} onClick={props.onDelete}>VOLLEDIG WISSEN</button>
        </div>
      </div>
    </div>
  );
}
