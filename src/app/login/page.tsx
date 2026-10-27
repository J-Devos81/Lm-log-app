"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tab = "login" | "register" | "forgot";
type Step = "form" | "resetCode" | "newPassword";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");
  const [step, setStep] = useState<Step>("form");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; text: string } | null>(null);

  async function call(url: string, body: Record<string, unknown>, method = "POST") {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, json: j };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (tab === "register") {
      const r = await call("/api/auth/register", { username, password });
      setMsg(r.ok
        ? { t: "ok", text: "Registratie verstuurd. De beheerder keurt je aanvraag goed; daarna kun je inloggen." }
        : { t: "err", text: r.json.error ?? "Fout bij registratie." });
      return;
    }
    if (tab === "forgot") {
      const r = await call("/api/auth/reset/request", { username });
      setMsg(r.ok
        ? { t: "ok", text: r.json.message ?? "Aanvraag verstuurd." }
        : { t: "err", text: r.json.error ?? "Fout." });
      return;
    }
    if (step === "newPassword") {
      const r = await call("/api/auth/login", { username, resetCode, newPassword: password }, "PUT");
      if (r.ok && r.json.ok) { router.push("/"); router.refresh(); }
      else setMsg({ t: "err", text: r.json.error ?? "Fout bij opslaan." });
      return;
    }
    const r = await call("/api/auth/login", {
      username,
      password,
      resetCode: step === "resetCode" ? resetCode : undefined,
    });
    if (r.ok && r.json.ok) { router.push("/"); router.refresh(); return; }
    if (r.json.step === "RESET_CODE") { setStep("resetCode"); setMsg({ t: "ok", text: "Er loopt een goedgekeurde herstelsessie; voer de 6-cijferige code in." }); return; }
    if (r.json.step === "NEW_PASSWORD") { setStep("newPassword"); setMsg({ t: "ok", text: "Code correct; kies nu een nieuw wachtwoord." }); return; }
    setMsg({ t: "err", text: r.json.error ?? "Inloggen mislukt." });
  }

  function resetAll() { setStep("form"); setMsg(null); setResetCode(""); setPassword(""); }

  const titles: Record<Tab, { k: string; t: string; p: string; btn: string }> = {
    login: { k: "WELKOM TERUG", t: "Aanmelden bij Km-Log", p: "Gebruik je persoonlijke gebruikersnaam en wachtwoord.", btn: "Aanmelden" },
    register: { k: "NIEUW ACCOUNT", t: "Registreren bij Km-Log", p: "Je aanvraag komt in de wachtrij van de beheerder; pas na goedkeuring kun je inloggen.", btn: "Registratie versturen" },
    forgot: { k: "HERSTEL", t: "Wachtwoord vergeten", p: "De beheerder keurt je herstel-aanvraag goed en geeft je persoonlijk een 6-cijferige code (30 min geldig).", btn: "Herstel-aanvraag versturen" },
  };

  return (
    <div className="login-split bg-odometer">
      <div className="login-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo-dark" src="/logo.png" alt="TUC RAIL" />
        <div className="hero-mid">
          <div className="kicker">RITREGISTRATIE · 2024 — 2060</div>
          <h1 className="big">Elke kilometer.<br /><span>Exact op spoor.</span></h1>
          <p>Van dag- en nachtritten tot je privélimiet: één betrouwbaar overzicht, rechtstreeks vanaf je kilometerteller.</p>
          <div className="hero-checks">
            <span>✓ Excel-getrouwe totalen</span>
            <span>✓ Persoonlijk en beveiligd</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#ffd9d5" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fox.png" alt="fox" style={{ height: 40 }} />
          <small>Ontworpen voor dagelijks gebruik.</small>
        </div>
      </div>

      <div className="login-card">
        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
          <span>🔒 BEVEILIGDE TOEGANG</span><span>VERSIE 1.0</span>
        </div>
        <div className="tab-h">
          {(["login", "register", "forgot"] as Tab[]).map(t => (
            <button key={t} className={tab === t ? "active" : ""}
              onClick={() => { setTab(t); resetAll(); }}>
              {t === "login" ? "Inloggen" : t === "register" ? "Registreren" : "WW vergeten"}
            </button>
          ))}
        </div>

        <div>
          <div className="small-k">{titles[tab].k}</div>
          <h3>{titles[tab].t}</h3>
          <p className="lede">{titles[tab].p}</p>
        </div>

        {msg && <div className={"msg-banner " + msg.t}>{msg.text}</div>}

        <form onSubmit={submit}>
          <label className="field-label">Gebruikersnaam</label>
          <input value={username} placeholder="bv. DEVOS Jimmy"
            onChange={e => setUsername(e.target.value)} autoCapitalize="none" />
          {tab === "login" && step === "form" && (
            <>
              <label className="field-label">Wachtwoord</label>
              <input type="password" placeholder="Je wachtwoord" value={password}
                onChange={e => setPassword(e.target.value)} />
            </>
          )}
          {tab === "login" && step === "resetCode" && (
            <>
              <label className="field-label">6-cijferige herstelcode</label>
              <input placeholder="••••••" value={resetCode} maxLength={6}
                inputMode="numeric" onChange={e => setResetCode(e.target.value.replace(/\D/g, ""))} />
            </>
          )}
          {tab === "login" && step === "newPassword" && (
            <>
              <label className="field-label">Nieuw wachtwoord (min. 8 tekens)</label>
              <input type="password" value={password}
                onChange={e => setPassword(e.target.value)} />
            </>
          )}
          <button className="btn-main" type="submit">
            {tab === "login"
              ? step === "newPassword" ? "Nieuw wachtwoord opslaan" : step === "resetCode" ? "Code controleren" : "Aanmelden →"
              : titles[tab].btn}
          </button>
        </form>
        {tab === "login" && step === "form" && (
          <button className="link-muted" onClick={() => { setTab("forgot"); resetAll(); }}>Wachtwoord vergeten?</button>
        )}
        {tab === "login" && step !== "form" && (
          <button className="link-muted" onClick={resetAll}>Terug naar inloggen</button>
        )}
        <p className="login-note">Geen e-mail of externe codes · persoonlijke goedkeuring door de beheerder</p>
      </div>
    </div>
  );
}
