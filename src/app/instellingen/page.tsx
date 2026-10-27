"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";

export default function InstellingenPage() {
  const router = useRouter();
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [kmLimit, setKmLimit] = useState("14000");
  const [euroPerKm, setEuroPerKm] = useState("0,175");
  const [correctie, setCorrectie] = useState("0");
  const [role, setRole] = useState("");
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/settings", { cache: "no-store" });
    if (r.status === 401) { router.push("/login"); return; }
    const j = await r.json();
    setKmLimit(String(j.kmLimit)); setEuroPerKm(String(j.euroPerKm).replace(".", ","));
    setCorrectie(String(j.priveCorrectie ?? 0));
    setRole(j.role ?? ""); setUsername(j.username ?? "");
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function saveAdmin() {
    const r = await fetch("/api/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kmLimit: Number(kmLimit.replace(/\D/g, "")), euroPerKm: Number(euroPerKm.replace(",", ".")) }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Instellingen bewaard." : (j.error ?? "Fout."));
    await load();
  }
  async function saveCorrectie() {
    const r = await fetch("/api/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priveCorrectie: Number(correctie.replace(",", ".")) }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Correctie opgeslagen." : (j.error ?? "Fout."));
    await load();
  }
  async function deleteAccount() {
    const r = await fetch("/api/account", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: delConfirm }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) router.push("/login");
    else setMsg(j.error ?? "Bevestiging onjuist.");
  }

  return (
    <div className="bg-spoorweg">
      <div className="bg-scrim" />
      <TopNav year={year} username={username} role={role} active="Instellingen" onYear={setYear} />
      <main className="page">
        {msg && <div className="msg-banner ok"><b>{msg}</b></div>}
        <div className="hero-card" style={{ maxWidth: 760 }}>
          <div>
            <div className="kicker">INSTELLINGEN · {username.toUpperCase()}</div>
            <h2 className="title" style={{ fontSize: 24 }}>OVERZICHT</h2>
          </div>
        </div>

        {role === "ADMIN" && (
          <div className="hero-card" style={{ maxWidth: 760, display: "block" }}>
            <div className="kicker">APP-BREED · ALLEEN BEHEERDER</div>
            <h3 style={{ fontFamily: "Georgia, serif", margin: "4px 0 14px", fontSize: 20 }}>Km-limiet & tarief</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label className="field-label">Jaarlimiet (km)</label>
                <input value={kmLimit} inputMode="numeric" onChange={e => setKmLimit(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label className="field-label">Tarief (EUR/km)</label>
                <input value={euroPerKm} onChange={e => setEuroPerKm(e.target.value)} />
              </div>
            </div>
            <button className="btn-main" style={{ width: "auto", padding: "0 26px", borderRadius: 9 }} onClick={saveAdmin}>✓ Opslaan</button>
          </div>
        )}

        <div className="hero-card" style={{ maxWidth: 760, display: "block" }}>
          <div className="kicker">PRIVÉ-JAARTOTAAL BIJSTUREN</div>
          <h3 style={{ fontFamily: "Georgia, serif", margin: "4px 0 14px", fontSize: 20 }}>Handmatige correctie</h3>
          <div style={{ display: "flex", gap: 12 }}>
            <input value={correctie} onChange={e => setCorrectie(e.target.value)}
              style={{ width: 160, background: "#171b21", border: "1px solid rgba(255,255,255,.16)", color: "#fff", borderRadius: 9, padding: 13, fontSize: 15 }} />
            <button className="btn-main" style={{ width: "auto", padding: "0 26px", borderRadius: 9, margin: 0 }} onClick={saveCorrectie}>✓ Correctie opslaan</button>
          </div>
          <small style={{ color: "var(--muted)" }}>Positief of negatief; boven 5% van het jaartotaal krijg je een waarschuwing.</small>
        </div>

        <div className="hero-card" style={{ maxWidth: 760, display: "block", borderColor: "rgba(229,72,77,.4)" }}>
          <div className="kicker" style={{ color: "var(--red)" }}>GEVOLGEN · ALLE DATA GAAT VERLOREN</div>
          <h3 style={{ fontFamily: "Georgia, serif", margin: "4px 0 14px", fontSize: 20 }}>Account verwijderen</h3>
          <p className="subline" style={{ padding: 0 }}>In één transactie worden je account, ritten, jaren en instellingen gewist.</p>
          <button className="btn-chip" style={{ borderColor: "var(--red)", color: "#ff8f93" }} onClick={() => setDelOpen(true)}>🗑 Account verwijderen</button>
        </div>
      </main>

      {delOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "grid", placeItems: "center", zIndex: 100 }}>
          <div className="hero-card" style={{ display: "block", maxWidth: 480, width: "90%", margin: 0 }}>
            <div className="kicker" style={{ color: "var(--red)" }}>LAATSTE WAARSCHUWING</div>
            <h3 style={{ fontFamily: "Georgia, serif", margin: "4px 0 12px" }}>Typ je gebruikersnaam ter bevestiging</h3>
            <input value={delConfirm} onChange={e => setDelConfirm(e.target.value)} placeholder={username}
              style={{ width: "100%", background: "#171b21", color: "#fff", border: "1px solid rgba(255,255,255,.16)", borderRadius: 9, padding: 13 }} />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn-chip" style={{ flex: 1 }} onClick={() => setDelOpen(false)}>Annuleren</button>
              <button className="btn-main" style={{ margin: 0, width: "auto", flex: 1, borderRadius: 9 }} onClick={deleteAccount}>VOLLEDIG WISSEN</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
