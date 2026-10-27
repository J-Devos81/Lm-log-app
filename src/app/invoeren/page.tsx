"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Mobiele invoer: traject 1 (teller-scan) en traject 2 (handmatig).
// Deze pagina is bewust een aparte, mobiel-vriendelijke flow met grote touchdoelen.
type Traject = null | "scan" | "handmatig";
type ScanState = "idle" | "camera" | "check" | "type" | "done";

export default function InvoerenPage() {
  const router = useRouter();
  const [traject, setTraject] = useState<Traject>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [datum, setDatum] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tijd, setTijd] = useState("");
  const [stand, setStand] = useState("");
  const [parsed, setParsed] = useState<{ datum: string; tijd: string; stand: string } | null>(null);
  const [typeStand, setTypeStand] = useState<"Start" | "Stop">("Start");
  const [msg, setMsg] = useState("");
  const [Err, setErr] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [curYear, setCurYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    // inschatten schaal: mobiel vult de viewport met de invoercard
    const inschall = () => {
      const scale = Math.min(1, window.innerWidth / 420);
      document.body.style.setProperty("--m-s", String(scale));
    };
    inschall();
    window.addEventListener("resize", inschall);
    fetch("/api/settings", { cache: "no-store" }).then(r => {
      if (r.status === 401) router.push("/login");
    });
    // nieuwste jaar opzoeken
    fetch(`/api/year/${new Date().getFullYear()}`, { cache: "no-store" }).then(async r => {
      if (!r.ok) router.push("/");
      else {
        const j = await r.json();
        setCurYear(j.year);
      }
    });
    return () => window.removeEventListener("resize", inschall);
  }, [router]);

  async function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanState("idle");
  }

  async function startScan() {
    setErr("");
    setMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } } });
      streamRef.current = stream;
      setScanState("camera");
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 60);
    } catch (e: any) {
      setErr("Camera niet beschikbaar: " + (e?.message ?? e));
      setScanState("idle");
    }
  }

  async function shootAndScan() {
    setErr("OCR draait even…");
    const video = videoRef.current;
    if (!video) return;
    const c = document.createElement("canvas");
    c.width = video.videoWidth || 1280;
    c.height = video.videoHeight || 720;
    c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
    await stopCamera();
    try {
      const T = (await import("tesseract.js")).default;
      const { data } = await T.recognize(c.toDataURL("image/png"), "eng", {});
      const text = (data.text || "").replace(/\n/g, " ");
      // datum: DD-MM-YYYY of YYYY-MM-DD?  stand: langste cijferreeks
      const standMatch = [...text.matchAll(/(\d{4,7})/g)].sort((a, b) => b[1].length - a[1].length)[0];
      const dateMatch = text.match(/(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/) || text.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
      const timeMatch = text.match(/(\d{1,2}:\d{2})/);
      const norm = (d: string) => {
        let p = d.split(/[-/.]/).map(x => String(Number(x)));
        if (p[0].length === 4) return `${p[2]}-${p[1]}-${p[0]}`; // yyyy-mm-dd
        const y = p[2].length === 4 ? p[2] : "20" + p[2];
        return `${y}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`; // dd-mm
      };
      const p2 = {
        datum: dateMatch ? norm(dateMatch[1]) : datum,
        tijd: timeMatch ? timeMatch[1] : "",
        stand: standMatch ? standMatch[1] : "",
      };
      setParsed(p2);
      setDatum(p2.datum);
      setTijd(p2.tijd);
      setStand(p2.stand);
      setErr("");
      setScanState("check");
    } catch (e: any) {
      setErr("OCR mislukt; vul handmatig in.");
      setScanState("check");
      setParsed({ datum, tijd: "", stand: "" });
    }
  }

  async function submit(target: "Start" | "Stop") {
    setErr("");
    const r = await fetch("/api/trips", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year: Number(datum.slice(0, 4)),
        month: Number(datum.slice(5, 7)),
        day: Number(datum.slice(8, 10)),
        [target === "Start" ? "startKm" : "endKm"]: stand === "" ? null : Number(stand),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Fout bij opslaan."); return; }
    setScanState("done");
    setMsg(`${target}-stand ${stand} weggeschreven op ${datum}.`);
    setStand(""); setTijd(""); setParsed(null); setTypeStand("Start");
    setTimeout(() => { // terug naar het begin van de procedure
      setScanState("idle");
    }, 1600);
  }

  return (
    <div className="body-spoorweg" style={{ minHeight: "100vh", padding: 14 }}>
      <div className="topnav">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/logo.png" alt="TUC RAIL" style={{ background: "#fff", borderRadius: 6, padding: 3 }} />
        <div><h1>Km invoeren · {curYear}</h1></div>
        <span className="spacer" />
        <nav className="tabs"><a className="active" href="/">Maandraster</a></nav>
        <button className="btn-chip" onClick={() => router.push("/")}>← Raster</button>
      </div>

      {scanState === "idle" && (
        <div style={{ maxWidth: 420, margin: "18px auto" }}>
          {!traject && (
            <>
              <button onClick={() => setTraject("scan")} style={btn("#00b0f0")}>1 — Teller-foto scannen</button>
              <button onClick={() => setTraject("handmatig")} style={{ ...btn("#663300"), color: "#fff" }}>2 — Handmatig (kalender)</button>
              {msg && <div className="msg-banner ok" style={{ marginTop: 14 }}><b>{msg}</b></div>}
            </>
          )}
          {traject === "scan" && (
            <div style={{ ...inputCard }}>
              <h2 style={{ color: "var(--brown)" }}>Traject 1: foto van de teller</h2>
              <p style={{ fontSize: 14, opacity: .8 }}>Maak een foto waarop de datum, de tijd en de kilometerstand zichtbaar zijn.</p>
              <button onClick={startScan} className="britannic" style={btn("var(--cyan)")}>Camera starten</button>
              <button onClick={() => setTraject(null)} style={backBtn}>Terug</button>
            </div>
          )}
          {traject === "handmatig" && (
            <div style={{ ...inputCard }} className="scan-result">
              <h2 style={{ color: "var(--brown)" }}>Traject 2: handmatig</h2>
              <div style={{ ...rowStyle }}>
                <label>Datum</label>
                <input type="date" value={datum} style={f} onChange={e => setDatum(e.target.value)} />
              </div>
              <div style={{ ...rowStyle }}>
                <label>Type stand</label>
                <select value={typeStand} style={f} onChange={e => setTypeStand(e.target.value as "Start" | "Stop")}>
                  <option value="Start">Start</option><option value="Stop">Stop</option>
                </select>
              </div>
              <div style={{ ...rowStyle }}>
                <label>Kilometerstand</label>
                <input inputMode="numeric" value={stand} style={f} onChange={e => setStand(e.target.value.replace(/\D/g, ""))} />
              </div>
              <button onClick={() => submit(typeStand)} className="britannic" style={btn("var(--cyan)")}>Submit</button>
              <button onClick={() => setTraject(null)} style={backBtn}>Terug</button>
              {msg && <div style={{ color: "#0a7d0a", fontWeight: 700 }}>{msg}</div>}
              {Err && <div style={{ color: "#b00020" }}>{Err}</div>}
            </div>
          )}
          {Err && !traject && <div style={{ color: "#e66" }}>{Err}</div>}
        </div>
      )}

      {scanState === "camera" && (
        <div style={{ maxWidth: 420, margin: "18px auto", textAlign: "center" }}>
          <video ref={videoRef} playsInline muted className="camera-video" aria-label="Camera" />
          <button onClick={shootAndScan} className="britannic" style={{ ...btn("#000"), color: "#fff" }}>Foto en OCR</button>
          <button onClick={stopCamera} style={backBtn}>Stoppen</button>
        </div>
      )}

      {scanState === "check" && parsed && (
        <div style={{ ...inputCard }} className="scan-result">
          <h2 style={{ color: "var(--brown)" }}>Gelezen waarden — controleer</h2>
          <div style={{ ...rowStyle }}><label>Datum</label><input type="date" value={datum} style={f} onChange={e => setDatum(e.target.value)} /></div>
          <div style={{ ...rowStyle }}><label>Tijd</label><input value={tijd} style={f} onChange={e => setTijd(e.target.value)} /></div>
          <div style={{ ...rowStyle }}><label>Stand</label><input inputMode="numeric" value={stand} style={{ ...f, fontWeight: 800, fontSize: 22 }} onChange={e => setStand(e.target.value.replace(/\D/g, ""))} /></div>
          <p style={{ opacity: .7, fontSize: 13 }}>Klopt alles? Kies of dit een Start- of een Stop-stand is.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={() => submit("Start")} className="britannic" style={btn("var(--cyan)")}>Als START</button>
            <button onClick={() => submit("Stop")} className="britannic" style={{ ...btn("var(--brown)"), color: "#fff" }}>Als STOP</button>
          </div>
          <button onClick={() => setScanState("idle")} style={backBtn}>Opnieuw</button>
          {Err && <div style={{ color: "#b00020" }}>{Err}</div>}
        </div>
      )}
      {scanState === "done" && (
        <div style={{ ...inputCard, textAlign: "center" }}>
          <div className="big-number" style={{ color: "#0a7d0a" }}>✓</div>
          <p style={{ fontWeight: 700 }}>{msg}</p>
          <button onClick={() => setScanState("idle")} style={btn("var(--cyan)")}>Volgende invoer</button>
        </div>
      )}
    </div>
  );
}

const btn = (bg: string): React.CSSProperties => ({
  width: "100%", padding: 16, marginBottom: 10, borderRadius: 12, border: "none",
  background: bg, fontWeight: 800, fontSize: 17, cursor: "pointer",
});
const backBtn: React.CSSProperties = {
  width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ccc",
  background: "#f4f4f4", fontWeight: 700, cursor: "pointer",
};
const inputCard: React.CSSProperties = {
  background: "rgba(255,255,255,.97)", borderRadius: 14, padding: 18,
  boxShadow: "0 4px 16px rgba(0,0,0,.45)",
};
const f: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: 12, fontSize: 17, border: "1px solid #bbb", borderRadius: 8,
};
const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, margin: "10px 0",
  fontWeight: 700,
};

