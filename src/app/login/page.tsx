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
        ? { t: "ok", text: "Registratie verstuurd. De admin keurt je aanvraag goed; daarna kun je inloggen." }
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
    // login (met stappen)
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
    if (r.ok && r.json.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    if (r.json.step === "RESET_CODE") { setStep("resetCode"); setMsg({ t: "ok", text: "Er loopt een goedgekeurde herstelsessie; voer de 6-cijferige code in." }); return; }
    if (r.json.step === "NEW_PASSWORD") { setStep("newPassword"); setMsg({ t: "ok", text: "Code correct; kies nu een nieuw wachtwoord." }); return; }
    setMsg({ t: "err", text: r.json.error ?? "Inloggen mislukt." });
  }

  function resetAll() { setStep("form"); setMsg(null); setResetCode(""); setPassword(""); }

  return (
    <div className="auth-card">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="logo" style={{ height: 40 }} />
        <h1 className="britannic">Km-Log App</h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fox.png" alt="fox" style={{ height: 40, marginLeft: "auto" }} />
      </div>
      <div className="auth-tabs">
        {(["login", "register", "forgot"] as Tab[]).map(t => (
          <button key={t} className={tab === t ? "active" : ""}
            onClick={() => { setTab(t); resetAll(); }}>
            {t === "login" ? "Inloggen" : t === "register" ? "Registreren" : "WW vergeten"}
          </button>
        ))}
      </div>
      {msg && <div className={"msg " + msg.t}>{msg.text}</div>}
      <form onSubmit={submit}>
        <input placeholder="Gebruikersnaam" value={username}
          onChange={e => setUsername(e.target.value)} autoCapitalize="none" />
        {tab === "login" && step === "form" && (
          <input type="password" placeholder="Wachtwoord" value={password}
            onChange={e => setPassword(e.target.value)} />
        )}
        {tab === "login" && step === "resetCode" && (
          <input placeholder="6-cijferige herstelcode" value={resetCode} maxLength={6}
            inputMode="numeric" onChange={e => setResetCode(e.target.value.replace(/\D/g, ""))} />
        )}
        {tab === "login" && step === "resetCode" && (
          <input type="hidden" />
        )}
        {tab === "login" && step === "newPassword" && (
          <input type="password" placeholder="Nieuw wachtwoord (min. 8 tekens)" value={password}
            onChange={e => setPassword(e.target.value)} />
        )}
        {(tab === "register" || (tab === "forgot")) && (
          <small style={{ opacity: 0.75 }}>
            {tab === "register"
              ? "Je aanvraag komt in de wachtrij van de admin. Pas na goedkeuring kun je inloggen."
              : "De admin keurt je herstel-aanvraag goed en geeft je persoonlijk een 6-cijferige code."}
          </small>
        )}
        <button type="submit">
          {tab === "login"
            ? step === "newPassword" ? "Nieuw wachtwoord opslaan" : step === "resetCode" ? "Code controleren" : "Inloggen"
            : tab === "register" ? "Registratie versturen" : "Herstel-aanvraag versturen"}
        </button>
        {tab === "login" && step !== "form" && (
          <button type="button" style={{ background: "#999" }} onClick={resetAll}>Terug naar inloggen</button>
        )}
      </form>
    </div>
  );
}
