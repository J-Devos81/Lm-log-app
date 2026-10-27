"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export const YEARS_ACCEPT: number[] = Array.from({ length: 2060 - 2024 + 1 }, (_, i) => 2024 + i);

export default function TopNav(props: {
  year: number; username?: string; role?: string; active: "Jaaroverzicht" | "Maand overzicht" | "Beheer" | "Instellingen";
  onYear?: (y: number) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(props.username ?? "");
  const [role, setRole] = useState(props.role ?? "");

  useEffect(() => {
    if (props.username) return;
    fetch("/api/settings", { cache: "no-store" }).then(async r => {
      if (r.status === 401) { router.push("/login"); return; }
      const me = await r.json();
      if (me.username) setName(me.username);
      if (me.role) setRole(me.role);
    });
  }, [router, props.username]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const initials = name ? name.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase() : "?";
  const tabs: { label: typeof props.active; href: string }[] = [
    { label: "Jaaroverzicht", href: "/" },
    { label: "Maand overzicht", href: `/maand/${new Date().getMonth() + 1}?y=${props.year}` },
    { label: "Beheer", href: role === "ADMIN" ? "/admin" : "/", },
    { label: "Instellingen", href: "/instellingen" },
  ];

  return (
    <div className="topnav">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/logo.png" alt="TUC RAIL" />
        <div>
          <h1>DE Km-Log</h1>
          <small>TUC RAIL · BELGIAN RAIL ENGINEERING</small>
        </div>
      </div>
      <nav className="tabs">
        {tabs.map(t => role === "ADMIN" || (t.label !== "Beheer") ? (
          <a key={t.label} href={t.href}
            className={props.active === t.label ? "active" : ""}>{t.label}</a>
        ) : null)}
      </nav>
      <span className="spacer" />
      <div className="jaarselect">
        <span className="jaar-label">JAAR SELECT</span>
        <select value={props.year} onChange={e => props.onYear?.(Number(e.target.value))}>
          {YEARS_ACCEPT.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="userbadge">
        <div className="avatar">{initials}</div>
        <div className="who"><b>{name || "…"} {role === "ADMIN" ? "· Beheerder" : ""}</b><small>{" "}{PadCode(name)}{" "}</small></div>
        <button className="logout" onClick={logout} title="Afmelden">⇥</button>
      </div>
    </div>
  );
}

function PadCode(n: string) {
  void n; // placeholder: naam-badgetoelichting
  return "";
}

export function MonthNav({ year, month }: { year: number; month: number }) {
  const MONTHS = ["JANUARI", "FEBRUARI", "MAART", "APRIL", "MEI", "JUNI", "JULI", "AUGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DECEMBER"];
  const prev = month === 1 ? { m: 12, y: year - 1 } : { m: month - 1, y: year };
  const next = month === 12 ? { m: 1, y: year + 1 } : { m: month + 1, y: year };
  return (
    <span className="month-nav">
      <a href={`/maand/${prev.m}?y=${prev.y}`} style={{ textDecoration: "none", color: "inherit" }}>◀</a>
      <span style={{ minWidth: 110, textAlign: "center" }}>{MONTHS[month - 1]}</span>
      <a href={`/maand/${next.m}?y=${next.y}`} style={{ textDecoration: "none", color: "inherit" }}>▶</a>
    </span>
  );
}

// (YEARS_ACCEPT is bovenaan al geëxporteerd)
