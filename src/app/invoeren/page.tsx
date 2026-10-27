"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Tab = "handmatig" | "scan";
type ScanState = "idle" | "camera" | "check";

export default function InvoerenPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("handmatig");
  const [terug, setTerug] = useState<string>(`/maand/${new Date().getMonth() + 1}?y=${new Date().getFullYear()}`);
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [tijd, setTijd] = useState("");
  const [typeStand, setTypeStand] = useState<"START" | "STOP">("START");
  const [stand, setStand] = useState("");
  const [dagNacht, setDagNacht] = useState<"D" | "N">("D");
  const [prive, setPrive] = useState("0");
  const [huidig, setHuidig] = useState<{ start: number | null; end: number | null } | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // scan-flow
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [parsed, setParsed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("terug");
    if (t && t.startsWith("/maand/")) {
      setTerug(t);
      const mm = Number(t.match(/\/maand\/(\d+)/)?.[1]);
      const yy = Number(t.match(/y=(\d+)/)?.[1]) || new Date().getFullYear();
      if (mm >= 1 && mm <= 12) {
        setDatum(`${yy}-${String(mm).padStart(2, "0")}-01`);
        laadRij(yy, mm, 1);
      }
    }
  }, []);

  const laadRij = useCallback(async (y: number, m: number, d: number) => {
    const r = await fetch(`/api/year/${y}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    const row = j.months?.find((x: { month: number }) => x.month === m)?.days?.find((x: { day: number }) => x.day === d);
    if (row) setHuidig({ start: row.startKm, end: row.endKm });
  }, []);

  function kiesDatum(v: string) {
    setDatum(v);
    setHuidig(null);
    laadRij(Number(v.slice(0, 4)), Number(v.slice(5, 7)), Number(v.slice(8, 10)));
  }

  async function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanState("idle");
  }

  async function startScan() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } } });
      streamRef.current = stream;
      setScanState("camera");
      setTimeout(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      }, 60);
    } catch (e: any) {
      setErr("Camera niet beschikbaar: " + (e?.message ?? e));
    }
  }

  async function ocrCanvas(c: HTMLCanvasElement) {
    try {
      const T = (await import("tesseract.js")).default;
      const { data } = await T.recognize(c.toDataURL("image/png"), "eng", {});
      const text = (data.text || "").replace(/\n/g, " ");
      const standMatch = [...text.matchAll(/(\d{4,7})/g)].sort((a, b) => Number(b[1]) - Number(a[1]))[0];
      setStand(standMatch ? standMatch[1] : "");
      setParsed(true);
      setScanState("check");
      setErr("");
    } catch {
      setErr("OCR mislukt; vul de stand handmatig in.");
      setParsed(true);
      setScanState("check");
    }
  }

  async function shootAndScan() {
    setErr("OCR draait even…");
    const video = videoRef.current;
    if (!video) return;
    const c = document.createElement("canvas");
    c.width = video.videoWidth || 1280; c.height = video.videoHeight || 720;
    c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
    await stopCamera();
    await ocrCanvas(c);
  }

  async function scanFile(file: File) {
    setErr("OCR draait even…");
    try {
      const bmp = await createImageBitmap(file);
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      c.getContext("2d")?.drawImage(bmp, 0, 0);
      await ocrCanvas(c);
    } catch (e: any) {
      setErr("Foto kon niet gelezen worden: " + (e?.message ?? e));
    }
  }

  async function opslaan() {
    setErr(""); setMsg("");
    const r = await fetch("/api/trips", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year: Number(datum.slice(0, 4)), month: Number(datum.slice(5, 7)), day: Number(datum.slice(8, 10)),
        dayNight: dagNacht,
        [typeStand === "START" ? "startKm" : "endKm"]: stand === "" ? null : Number(stand),
        // A2: privé alleen bij STOP meesturen — een START-save mag bestaande privé op de dag niet wissen
        ...(typeStand === "STOP" && prive !== "" ? { priveKm: Number(prive) } : {}),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Fout bij opslaan."); return; }
    const g = Number(stand);
    const pb = j.priveBoeking as { month: number; day: number; priveKm: number } | null | undefined;
    setMsg(
      `${typeStand === "START" ? "Startstand" : "Stopstand"} ${stand} opgeslagen op ${datum}.` +
      (pb ? ` Privé-km: ${pb.priveKm} km geboekt op ${String(pb.day).padStart(2, "0")}/${String(pb.month).padStart(2, "0")}.` : "")
    );
    setHuidig(null);
    // doorloop: datum blijft, stand loopt door als beginpunt van de volgende invoer
    setTypeStand(typeStand === "START" ? "STOP" : "START");
    if (typeStand === "STOP") {
      const nd = new Date(datum); nd.setDate(nd.getDate() + 1);
      setDatum(nd.toISOString().slice(0, 10));
      laadRij(nd.getFullYear(), nd.getMonth() + 1, nd.getDate());
    }
    setStand(String(g));
  }

  const sluit = () => router.push(terug);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,6,12,.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 520, maxHeight: "94vh", overflowY: "auto", background: "#fff", borderRadius: 18, padding: "26px 28px 22px", fontFamily: '"Segoe UI", system-ui, Arial, sans-serif', color: "#1a1d21", boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}>
        {/* kop */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#d92c23", fontSize: 11, fontWeight: 800, letterSpacing: 2.2 }}>MOBIELE INVOER</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 800 }}>Km invoeren</h2>
          </div>
          <button onClick={sluit} aria-label="Sluiten" style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#444", lineHeight: 1 }}>✕</button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #eee", marginTop: 14 }}>
          {([["handmatig", "⌨ Handmatig"], ["scan", "⛶ Teller scannen"]] as [Tab, string][]).map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); setErr(""); setMsg(""); }}
              style={{ flex: 1, padding: "12px 0", background: "none", border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 700,
                color: tab === id ? "#1a1d21" : "#9aa0ab", borderBottom: tab === id ? "3px solid #d92c23" : "3px solid transparent", marginBottom: -2 }}>
              {label}
            </button>
          ))}
        </div>

        {msg && <div style={{ marginTop: 12, background: "#e9f8ee", border: "1px solid #b7e4c3", color: "#137a2c", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 600 }}>{msg}</div>}
        {err && <div style={{ marginTop: 12, background: "#fdecec", border: "1px solid #f3b6b2", color: "#b3261e", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 600 }}>{err}</div>}

        {tab === "handmatig" && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={lbl}>Datum</label>
                <input type="date" value={datum} onChange={e => kiesDatum(e.target.value)} style={f} />
              </div>
              <div>
                <label style={lbl}>Tijd (optioneel)</label>
                <input type="time" value={tijd} onChange={e => setTijd(e.target.value)} style={{ ...f, color: tijd ? "#1a1d21" : "#a0a4ab" }} />
              </div>
            </div>

            <label style={lbl}>Type kilometerstand</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {(["START", "STOP"] as const).map(t => (
                <button key={t} onClick={() => setTypeStand(t)}
                  style={{ textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                    background: typeStand === t ? "#fdeeee" : "#fff",
                    border: typeStand === t ? "2px solid #d92c23" : "1.5px solid #d6d9de", color: "#1a1d21" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 800, fontSize: 14 }}>
                    {t} {typeStand === t && <span style={{ color: "#d92c23" }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7078", marginTop: 2 }}>{t === "START" ? "Beginstand van de rit" : "Eindstand van de rit"}</div>
                </button>
              ))}
            </div>

            <label style={lbl}>Kilometerstand</label>
            <div style={{ background: "#fdf3c9", border: "1.5px solid #eadf9f", borderRadius: 10, display: "flex", alignItems: "center", padding: "4px 16px" }}>
              <span style={{ color: "#9b9478", fontWeight: 700, fontSize: 15, marginRight: 12 }}>bv.</span>
              <input inputMode="numeric" placeholder="39504" value={stand}
                onChange={e => setStand(e.target.value.replace(/\D/g, ""))}
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 26, fontWeight: 800, color: "#4a4433", minWidth: 0, padding: "12px 0" }} />
              <span style={{ color: "#6b6752", fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>KM</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 4 }}>
              <div>
                <label style={lbl}>Dag / nacht</label>
                <select value={dagNacht} onChange={e => setDagNacht(e.target.value as "D" | "N")} style={{ ...f, color: "#1a1d21" }}>
                  <option value="D">D — dagrit</option>
                  <option value="N">N — nacht (+1 dag)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Privé-km</label>
                <input inputMode="numeric" value={prive} onChange={e => setPrive(e.target.value.replace(/\D/g, ""))} style={f} />
              </div>
            </div>

            <div style={{ background: "#f3f4f6", borderRadius: 8, padding: "9px 14px", display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b7078", marginTop: 14 }}>
              <span>Huidige rij {datum}</span>
              <span>{huidig?.start ?? "–"} → {huidig?.end ?? "–"}</span>
            </div>

            <button onClick={opslaan} style={{ width: "100%", marginTop: 16, padding: 16, borderRadius: 12, border: "none", background: "linear-gradient(180deg,#e23a2e,#c0271c)", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
              {typeStand === "START" ? "Startstand opslaan" : "Stopstand opslaan"}
            </button>
            <p style={{ textAlign: "center", fontSize: 12.5, color: "#8a8f98", marginTop: 10 }}>
              De server controleert de stand en berekende meteen alle totalen opnieuw.
            </p>
            {msg && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
                <button onClick={sluit} style={roodBtn}>✓ Klaar — terug naar maand overzicht</button>
                <button onClick={() => setMsg("")} style={{ ...roodBtn, background: "#fff", color: "#1a1d21", border: "2px solid #d6d9de" }}>＋ Nog een invoer</button>
              </div>
            )}
          </div>
        )}

        {tab === "scan" && scanState === "idle" && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 14, color: "#6b7078" }}>Maak een foto waarop de kilometerstand (en liefst datum & tijd) zichtbaar zijn. De server leest de stand met OCR.</p>
            <button onClick={startScan} style={{ ...roodBtn }}>📷 Camera starten</button>
            <label style={{ ...roodBtn, display: "flex", alignItems: "center", justifyContent: "center", background: "#5a5f68" }}>
              📁 Bestand kiezen
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) scanFile(f); }} />
            </label>
          </div>
        )}

        {tab === "scan" && scanState === "camera" && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 12, background: "#000" }} />
            <button onClick={shootAndScan} style={{ ...roodBtn, marginTop: 12 }}>⛶ Foto maken en scannen</button>
            <button onClick={stopCamera} style={witBtn}>Stoppen</button>
          </div>
        )}

        {tab === "scan" && scanState === "check" && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 14, color: "#6b7078" }}>Gelezen stand — controleer en kies het type:</p>
            <input inputMode="numeric" value={stand} placeholder="39504"
              onChange={e => setStand(e.target.value.replace(/\D/g, ""))}
              style={{ width: "100%", fontSize: 26, fontWeight: 800, padding: "12px 16px", borderRadius: 10, border: "1.5px solid #eadf9f", background: "#fdf3c9", color: "#4a4433" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
              <button onClick={() => { setTypeStand("START"); opslaan(); }} style={{ ...roodBtn, background: "#fff", color: "#1a1d21", border: "2px solid #d6d9de" }}>Als START opslaan</button>
              <button onClick={() => { setTypeStand("STOP"); opslaan(); }} style={roodBtn}>Als STOP opslaan</button>
            </div>
            <button onClick={() => setScanState("idle")} style={{ ...witBtn, marginTop: 10 }}>Opnieuw scannen</button>
          </div>
        )}
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, margin: "16px 0 6px", color: "#3a3e44" };
const f: React.CSSProperties = { width: "100%", padding: "12px 14px", fontSize: 15, border: "1.5px solid #d6d9de", borderRadius: 10, outline: "none", background: "#fff" };
const roodBtn: React.CSSProperties = { width: "100%", marginTop: 12, padding: 15, borderRadius: 12, border: "none", background: "linear-gradient(180deg,#e23a2e,#c0271c)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" };
const witBtn: React.CSSProperties = { width: "100%", marginTop: 12, padding: 13, borderRadius: 12, border: "1.5px solid #d6d9de", background: "#fff", color: "#1a1d21", fontSize: 14.5, fontWeight: 700, cursor: "pointer" };
