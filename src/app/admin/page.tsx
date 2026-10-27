"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";

interface Req { id: number; kind: "REGISTRATION" | "RESET"; username: string; createdAt: string }

export default function AdminPage() {
  const router = useRouter();
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [regs, setRegs] = useState<Req[]>([]);
  const [resets, setResets] = useState<Req[]>([]);
  const [codes, setCodes] = useState<{ username: string; code: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [role, setRole] = useState("");
  const [username, setUsername] = useState("");

  const load = useCallback(async () => {
    const me = await fetch("/api/settings", { cache: "no-store" });
    if (me.status !== 200) { router.push("/login"); return; }
    const mj = await me.json();
    setRole(mj.role ?? ""); setUsername(mj.username ?? "");
    if (mj.role !== "ADMIN") { router.push("/"); return; }
    const r = await fetch("/api/admin/requests", { cache: "no-store" });
    const j = await r.json();
    setRegs(j.registrations ?? []);
    setResets(j.resets ?? []);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function decide(id: number, action: "approve" | "reject") {
    const r = await fetch(`/api/admin/requests/${id}/${action}`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (j.code) setCodes(c => [...c, { username: (resets.find(x => x.id === id)?.username) ?? "", code: j.code }]);
    setMsg(j.message ?? j.error ?? "");
    await load();
  }

  return (
    <div className="bg-spoorweg">
      <div className="bg-scrim" />
      <TopNav year={year} username={username} role={role} active="Beheer" onYear={setYear} />
      <main className="page">
        {msg && <div className="msg-banner ok"><b>{msg}</b></div>}
        {codes.map((c, i) => (
          <div className="hero-card" key={i} style={{ display: "block", borderColor: "var(--cyan)" }}>
            <div className="kicker" style={{ color: "var(--cyan)" }}>HERSTELCODE — EEN KEER TONEN · 30 MIN GELDIG</div>
            <p className="subline" style={{ padding: 0 }}>Geef deze code persoonlijk door aan <b>{c.username}</b>.</p>
            <div style={{ fontFamily: "monospace", fontSize: 30, letterSpacing: 10, color: "#8fe3ff", background: "#0b0e11", borderRadius: 10, padding: "10px 18px", display: "inline-block" }}>
              {c.code}
            </div>
          </div>
        ))}

        <div className="hero-card" style={{ display: "block" }}>
          <div className="kicker">GOEDKEURINGSFLOWS · WACHTRIJ</div>
          <h3 style={{ fontFamily: "Georgia, serif", margin: "4px 0 16px", fontSize: 22 }}>Nieuwe registraties</h3>
          {regs.length === 0 && <small style={{ color: "var(--muted)" }}>Geen openstaande registraties.</small>}
          {regs.map(rq => (
            <div key={rq.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <b>Nieuwe registratie: {rq.username}</b>
              <span style={{ flex: 1 }} />
              <button className="btn-chip" style={{ borderColor: "var(--ok)" }} onClick={() => decide(rq.id, "approve")}>✓ Goedkeuren</button>
              <button className="btn-chip" style={{ borderColor: "var(--red)", color: "#ff8f93" }} onClick={() => decide(rq.id, "reject")}>✗ Afwijzen</button>
            </div>
          ))}
        </div>

        <div className="hero-card" style={{ display: "block" }}>
          <div className="kicker">GOEDKEURINGSFLOWS · WACHTRIJ</div>
          <h3 style={{ fontFamily: "Georgia, serif", margin: "4px 0 16px", fontSize: 22 }}>Wachtwoordherstel</h3>
          {resets.length === 0 && <small style={{ color: "var(--muted)" }}>Geen openstaande resets.</small>}
          {resets.map(rq => (
            <div key={rq.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <b>User {rq.username} aanvraag reset WW</b>
              <span style={{ flex: 1 }} />
              <button className="btn-chip" style={{ borderColor: "var(--ok)" }} onClick={() => decide(rq.id, "approve")}>Ja</button>
              <button className="btn-chip" style={{ borderColor: "var(--red)", color: "#ff8f93" }} onClick={() => decide(rq.id, "reject")}>Nee</button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
