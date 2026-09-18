"use client";
import { useState } from "react";

const post = async (path, body) => {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
};

const STAGES = [
  ["Source", "Live Google Maps search"],
  ["Read site", "Fetch each practice's own site"],
  ["Qualify", "Fit, or not, and why"],
  ["Draft", "First-touch note for review"],
];

export default function Page() {
  const [query, setQuery] = useState("psychiatry practice");
  const [location, setLocation] = useState("New York, NY");
  const [rows, setRows] = useState([]);
  const [stage, setStage] = useState(-1);
  const [status, setStatus] = useState("Idle");
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);

  const update = (i, patch) =>
    setRows((prev) => prev.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  async function run() {
    setRunning(true);
    setErr(null);
    setRows([]);
    setStage(0);
    setStatus("Searching Google Maps");

    const src = await post("/api/source", { query, location, limit: 6 });
    if (src.error) {
      setErr(src.error);
      setRunning(false);
      setStage(-1);
      setStatus("Failed");
      return;
    }

    const places = src.places || [];
    if (!places.length) {
      setErr("No results returned for that search.");
      setRunning(false);
      setStage(-1);
      setStatus("No results");
      return;
    }

    setRows(places.map((p) => ({ ...p, state: "queued" })));

    setStage(1);
    for (let i = 0; i < places.length; i++) {
      setStatus(`Reading ${places[i].name}`);
      update(i, { state: "reading" });
      const e = await post("/api/enrich", { website: places[i].website });
      update(i, { siteText: e.text, email: e.email, readOk: e.ok, state: "read" });
      places[i].siteText = e.text;
      places[i].email = e.email;
    }

    setStage(2);
    for (let i = 0; i < places.length; i++) {
      setStatus(`Qualifying ${places[i].name}`);
      update(i, { state: "qualifying" });
      const q = await post("/api/qualify", {
        practice: places[i],
        siteText: places[i].siteText,
        region: location,
      });
      places[i].verdict = q.verdict;
      places[i].signals = q.signals || [];
      update(i, {
        verdict: q.verdict,
        reason: q.reason,
        signals: q.signals || [],
        state: "qualified",
      });
    }

    setStage(3);
    for (let i = 0; i < places.length; i++) {
      if (places[i].verdict !== "fit") continue;
      setStatus(`Drafting for ${places[i].name}`);
      update(i, { state: "drafting" });
      const d = await post("/api/draft", {
        practice: places[i],
        signals: places[i].signals,
      });
      update(i, { draft: d.text, state: "done" });
    }

    const fits = places.filter((p) => p.verdict === "fit").length;
    setStage(4);
    setStatus(`Done. ${fits} drafted, ${places.length - fits} skipped, 0 sent.`);
    setRunning(false);
  }

  return (
    <main className="wrap">
      <header>
        <p className="eyebrow">Agent demo &middot; built for Zenara Health</p>
        <h1>Psychiatry Lead Agent</h1>
        <p className="sub">
          Searches Google Maps for practices in a region, reads each practice&apos;s own
          website, decides which ones fit the ICP and why, then drafts a first-touch note
          for Ravi to edit. It stops at drafted. Nothing sends itself.
        </p>
      </header>

      <div className="controls">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What to search" disabled={running} />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where" disabled={running} />
        <button className="primary" onClick={run} disabled={running}>
          {running ? "Running" : "Run the agent"}
        </button>
      </div>
      <p className="status">{running && <span className="spin" />}{status}</p>
      {err && <div className="err">{err}</div>}

      <div className="stages">
        {STAGES.map(([t, d], i) => (
          <div key={t} className={`stage${stage === i ? " on" : ""}${stage > i ? " done" : ""}`}>
            <div className="n">Step {i + 1}</div>
            <div className="t">{t}</div>
            <div className="d">{d}</div>
          </div>
        ))}
      </div>

      <div className="grid">
        {rows.map((p, i) => (
          <div key={i} className={`card ${p.verdict || ""}`}>
            <p className="pname">{p.name}</p>
            <p className="pmeta">
              {p.address}
              {p.website ? ` · ${p.website.replace(/^https?:\/\//, "")}` : ""}
            </p>

            {p.verdict && (
              <span className={`verdict v-${p.verdict}`}>
                {p.verdict === "fit" ? "Fits ICP" : p.verdict === "nofit" ? "Not a fit" : "Needs a human look"}
              </span>
            )}

            {p.reason && (
              <div className="reason">
                <div className="rh">Agent reasoning</div>
                {p.reason}
              </div>
            )}

            {p.signals?.length > 0 && (
              <ul className="signals">
                {p.signals.map((s, n) => <li key={n}>{s}</li>)}
              </ul>
            )}

            {p.state && p.state !== "done" && p.state !== "qualified" && (
              <p className="work"><span className="spin" />{p.state}</p>
            )}

            {p.readOk === false && (
              <p className="src">Site could not be read, so qualification ran on the listing alone.</p>
            )}

            {p.draft && (
              <>
                <div className="draft">
                  <div className="dh">Drafted for Ravi to edit</div>
                  {p.draft}
                </div>
                <p className="src">
                  {p.email
                    ? `Ready to send to ${p.email}, published openly on their site.`
                    : "No address published on their site. Flagged for lookup rather than guessing one."}
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="note">
        <strong>How this runs.</strong> Sourcing is a live Google Maps query through SerpApi.
        Each practice&apos;s website is fetched and read at run time. Qualification and drafting are
        live model calls, so results differ between runs. Contact addresses are only shown where a
        practice publishes one openly on its own site; where none exists the agent flags it for a
        lookup rather than inventing an address.
      </div>

      <footer>Built by Vimal Cherangattu.</footer>
    </main>
  );
}
