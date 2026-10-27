"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Req { id: number; kind: "REGISTRATION" | "RESET"; username: string; createdAt: string }

export default function AdminPage() {
  const router = useRouter();
  const [regs, setRegs] = useState<Req[]>([]);
  const [resets, setResets] = useState<Req[]>([]);
  const [codes, setCodes] = useState<{ username: string; code: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [kmLimit, setKmLimit] = useState("14000");
  const [euroPerKm, setEuroPerKm] = useState("0,175");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/requests", { cache: "no-store" });
    if (r.status !== 200) { router.push("/login"); return; }
    const j = await r.json();
    setRegs(j.registrations ?? []);
    setResets(j.resets ?? []);
    const s = await fetch("/api/settings", { cache: "no-store" });
    if (s.ok) {
      const sj = await s.json();
      setKmLimit(String(sj.kmLimit));
      setEuroPerKm(String(sj.euroPerKm).replace(".", ","));
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function decide(id: number, action: "approve" | "reject") {
    const r = await fetch(`/api/admin/requests/${id}/${action}`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (j.code) setCodes(c => [...c, { username: (resets.find(x => x.id === id)?.username) ?? "", code: j.code }]);
    setMsg(j.message ?? j.error ?? "");
    await load();
  }

  async function saveSettings() {
    const r = await fetch("/api/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kmLimit: Number(kmLimit.replace(/\./g, "")), euroPerKm: Number(euroPerKm.replace(",", ".")) }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Instellingen bewaard." : (j.error ?? "Fout."));
    await load();
  }

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }

  return (
    <div className="body-spoorweg" style={{ minHeight: "100vh" }}>
      <div className="topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/logo.png" alt="logo" style={{ background: "#fff", borderRadius: 4 }} />
        <h1 className="britannic">Admin-beheer</h1>
        <span className="spacer" />
        <a href="/" style={{ color: "#9fe", fontWeight: 700 }}>Terug naar raster</a>
        <button onClick={logout}>Afmelden</button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="fox" src="/fox.png" alt="" style={{ background: "#fff", borderRadius: 4 }} />
      </div>
      <main className="page">
        {msg && <div className="panel"><b>{msg}</b></div>}
        {codes.map((c, i) => (
          <div className="panel" key={i} style={{ border: "2px solid var(--cyan)" }}>
            <div>Herstelcode voor <b>{c.username}</b> (één keer tonen, 30 min geldig) — geef dit persoonlijk door:</div>
            <div className="code-display">{c.code}</div>
          </div>
        ))}
        <div className="panel">
          <h2 className="britannic">Instellingen (OVERZICHT)</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label>Km-limiet per jaar</label>
            <input value={kmLimit} inputMode="numeric"
              style={{ padding: 8, borderRadius: 6, border: "1px solid #bbb" }}
              onChange={e => setKmLimit(e.target.value.replace(/\D/g, ""))} />
            <label>Tarief EUR/km</label>
            <input value={euroPerKm}
              style={{ padding: 8, borderRadius: 6, border: "1px solid #bbb" }}
              onChange={e => setEuroPerKm(e.target.value)} />
            <button onClick={saveSettings} style={{ padding: "8px 18px", border: "none", borderRadius: 6, background: "var(--cyan)", fontWeight: 700, cursor: "pointer" }}>
              Bewaren
            </button>
          </div>
        </div>
        <div className="panel">
          <h2 className="britannic">Wachtrij registraties</h2>
          {regs.length === 0 && <small>Geen openstaande registraties.</small>}
          {regs.map(rq => (
            <div className="req-row" key={rq.id}>
              <span className="who">Nieuwe registratie: {rq.username}</span>
              <span style={{ flex: 1 }} />
              <button className="yes" onClick={() => decide(rq.id, "approve")}>Goedkeuren</button>
              <button className="no" onClick={() => decide(rq.id, "reject")}>Afwijzen</button>
            </div>
          ))}
        </div>
        <div className="panel">
          <h2 className="britannic">Wachtrij wachtwoordherstel</h2>
          {resets.length === 0 && <small>Geen openstaande resets.</small>}
          {resets.map(rq => (
            <div className="req-row" key={rq.id}>
              <span className="who">User {rq.username} aanvraag reset WW</span>
              <span style={{ flex: 1 }} />
              <button className="yes" onClick={() => decide(rq.id, "approve")}>Ja</button>
              <button className="no" onClick={() => decide(rq.id, "reject")}>Nee</button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
