"use client";
import { useMemo, useRef, useState } from "react";
import {
  DEFAULT_DRAFT_MIN_SCORE,
  DEFAULT_ICP,
  DEFAULT_WEIGHTS,
  WEIGHT_KEYS,
  scoreFrom,
  tierFor,
  verdictFor,
} from "./lib/icp";

const post = async (path, body) => {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
};

// Bounded parallelism. Sourcing is one call; everything after it fans out.
async function pool(items, size, fn) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(size, items.length) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;
        await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
}

const STAGES = [
  ["Source", "Google Maps search for the specialty and region"],
  ["Read sites", "Fetch each practice's own website"],
  ["Qualify", "Score against the ICP, with evidence"],
  ["Draft", "Icebreaker from Ravi, for review"],
];

const VERDICT_LABEL = {
  fit: "Fits ICP",
  pending: "Needs a human look",
  nofit: "Not a fit",
};

const listToText = (a) => (a || []).join(", ");
const textToList = (s) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export default function Page() {
  const [icp, setIcp] = useState(DEFAULT_ICP);
  const [limit, setLimit] = useState(12);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [draftMin, setDraftMin] = useState(DEFAULT_DRAFT_MIN_SCORE);
  const [angle, setAngle] = useState("");

  const [rows, setRows] = useState([]);
  const [stage, setStage] = useState(-1);
  const [status, setStatus] = useState("Idle");
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("all");
  const [panel, setPanel] = useState("icp");
  const [copied, setCopied] = useState(-1);

  // One mutable source of truth for the pipeline; React state is a snapshot
  // of it, so later stages never read stale data.
  const dataRef = useRef([]);
  const sync = () => setRows(dataRef.current.map((d) => ({ ...d })));
  const patch = (i, p) => {
    dataRef.current[i] = { ...dataRef.current[i], ...p };
    sync();
  };

  const setIcpField = (k, v) => setIcp((prev) => ({ ...prev, [k]: v }));

  async function draftFor(i) {
    const row = dataRef.current[i];
    patch(i, { state: "drafting" });
    const d = await post("/api/draft", {
      practice: row,
      signals: row.signals || [],
      hook: row.hook || "",
      angle,
    });
    patch(i, {
      subject: d.subject || "",
      draft: d.body || "",
      draftError: d.error || null,
      state: "done",
    });
  }

  async function run() {
    setRunning(true);
    setErr(null);
    setRows([]);
    setFilter("all");
    dataRef.current = [];
    setStage(0);
    setStatus(`Searching Google Maps for ${icp.specialty} in ${icp.region}`);

    const src = await post("/api/source", {
      specialty: icp.specialty,
      region: icp.region,
      limit: Number(limit) || 12,
    });

    if (src.error) {
      setErr(src.error);
      setRunning(false);
      setStage(-1);
      setStatus("Failed");
      return;
    }

    const places = src.places || [];
    if (!places.length) {
      setErr("No results returned for that search. Try a broader region.");
      setRunning(false);
      setStage(-1);
      setStatus("No results");
      return;
    }

    dataRef.current = places.map((p) => ({ ...p, state: "queued" }));
    sync();

    // Read sites
    setStage(1);
    let read = 0;
    await pool(dataRef.current, 4, async (row, i) => {
      patch(i, { state: "reading" });
      const e = await post("/api/enrich", { website: row.website });
      patch(i, {
        siteText: e.text,
        email: e.email,
        clinicians: e.clinicians || [],
        techSignals: e.techSignals || [],
        pagesRead: e.pagesRead || 0,
        readOk: e.ok,
        readNote: e.reason || "",
        state: "read",
      });
      read++;
      setStatus(`Read ${read} of ${dataRef.current.length} websites`);
    });

    // Qualify
    setStage(2);
    let done = 0;
    await pool(dataRef.current, 3, async (row, i) => {
      patch(i, { state: "qualifying" });
      const r = dataRef.current[i];
      const q = await post("/api/qualify", {
        practice: r,
        icp,
        weights,
        enrichment: {
          text: r.siteText,
          email: r.email,
          clinicians: r.clinicians,
          techSignals: r.techSignals,
          pagesRead: r.pagesRead,
        },
      });
      patch(i, {
        verdict: q.verdict,
        disqualified: q.disqualified,
        disqualifier: q.disqualifier,
        estimatedClinicians: q.estimatedClinicians,
        clinicianBasis: q.clinicianBasis,
        scores: q.scores,
        reason: q.reason || q.error || "",
        signals: q.signals || [],
        hook: q.hook || "",
        state: "qualified",
      });
      done++;
      setStatus(`Qualified ${done} of ${dataRef.current.length}`);
    });

    // Draft, for whatever clears the bar
    setStage(3);
    const targets = dataRef.current
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) => verdictFor(r, scoreFrom(r.scores, weights), draftMin) === "fit"
      );

    let drafted = 0;
    await pool(targets, 2, async ({ i }) => {
      await draftFor(i);
      drafted++;
      setStatus(`Drafted ${drafted} of ${targets.length}`);
    });

    setStage(4);
    setStatus(
      `Done. ${dataRef.current.length} sourced, ${targets.length} in ICP, ${drafted} drafted, 0 sent.`
    );
    setRunning(false);
  }

  const view = useMemo(() => {
    const scored = rows.map((r, i) => {
      const score = scoreFrom(r.scores, weights);
      return { r, i, score, verdict: r.scores ? verdictFor(r, score, draftMin) : null };
    });
    const filtered =
      filter === "all" ? scored : scored.filter((x) => x.verdict === filter);
    return filtered.sort((a, b) => b.score - a.score);
  }, [rows, weights, draftMin, filter]);

  const counts = useMemo(() => {
    const c = { all: rows.length, fit: 0, pending: 0, nofit: 0 };
    for (const r of rows) {
      if (!r.scores) continue;
      c[verdictFor(r, scoreFrom(r.scores, weights), draftMin)]++;
    }
    return c;
  }, [rows, weights, draftMin]);

  function exportCsv() {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = [
      "name", "address", "phone", "website", "email", "score", "tier",
      "verdict", "estimated_clinicians", "reason", "signals", "subject", "email_body",
    ];
    const lines = view.map(({ r, score, verdict }) =>
      [
        r.name, r.address, r.phone, r.website, r.email, score, tierFor(score),
        verdict ? VERDICT_LABEL[verdict] : "not qualified",
        r.estimatedClinicians ?? "", r.reason, (r.signals || []).join(" | "),
        r.subject, r.draft,
      ].map(esc).join(",")
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `zenara-leads-${icp.region.replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyEmail(i, r) {
    try {
      await navigator.clipboard.writeText(`Subject: ${r.subject}\n\n${r.draft}`);
      setCopied(i);
      setTimeout(() => setCopied(-1), 1600);
    } catch {
      setErr("Clipboard is blocked in this browser. Select the text instead.");
    }
  }

  const totalWeight = WEIGHT_KEYS.reduce(
    (n, w) => n + (Number(weights[w.key]) || 0),
    0
  );

  return (
    <main className="wrap">
      <header>
        <p className="eyebrow">Account-based outreach &middot; Zenara Health</p>
        <h1>Practice Finder</h1>
        <p className="sub">
          Give it a specialty and a region. It searches Google Maps, reads each
          practice&apos;s own website, scores them against an ICP you define, and drafts
          an icebreaker from Ravi for the ones that fit. It stops at drafted. Nothing
          sends itself.
        </p>
      </header>

      <div className="searchbar">
        <label className="field grow">
          <span>Specialty</span>
          <input
            value={icp.specialty}
            onChange={(e) => setIcpField("specialty", e.target.value)}
            placeholder="Psychiatry"
            disabled={running}
          />
        </label>
        <label className="field grow">
          <span>Region in the US</span>
          <input
            value={icp.region}
            onChange={(e) => setIcpField("region", e.target.value)}
            placeholder="Austin, TX"
            disabled={running}
          />
        </label>
        <label className="field narrow">
          <span>Practices</span>
          <input
            type="number"
            min="1"
            max="60"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            disabled={running}
          />
        </label>
        <button className="primary" onClick={run} disabled={running}>
          {running ? "Running" : "Run the agent"}
        </button>
      </div>

      <div className="tabs">
        {[
          ["icp", "Ideal customer profile"],
          ["weights", "Scoring"],
          ["email", "Email"],
        ].map(([k, label]) => (
          <button
            key={k}
            className={`tab${panel === k ? " on" : ""}`}
            onClick={() => setPanel(panel === k ? null : k)}
          >
            {label}
          </button>
        ))}
      </div>

      {panel === "icp" && (
        <div className="panel">
          <div className="row3">
            <label className="field">
              <span>Minimum clinicians</span>
              <input
                type="number" min="1"
                value={icp.minClinicians}
                onChange={(e) => setIcpField("minClinicians", Number(e.target.value))}
                disabled={running}
              />
            </label>
            <label className="field">
              <span>Maximum clinicians</span>
              <input
                type="number" min="1"
                value={icp.maxClinicians}
                onChange={(e) => setIcpField("maxClinicians", Number(e.target.value))}
                disabled={running}
              />
            </label>
            <label className="field check">
              <input
                type="checkbox"
                checked={icp.independentOnly}
                onChange={(e) => setIcpField("independentOnly", e.target.checked)}
                disabled={running}
              />
              <span>Independent practices only</span>
            </label>
          </div>
          <label className="field">
            <span>Positive signals, comma separated</span>
            <input
              value={listToText(icp.mustHave)}
              onChange={(e) => setIcpField("mustHave", textToList(e.target.value))}
              disabled={running}
            />
          </label>
          <label className="field">
            <span>Disqualifying signals, comma separated</span>
            <input
              value={listToText(icp.exclude)}
              onChange={(e) => setIcpField("exclude", textToList(e.target.value))}
              disabled={running}
            />
          </label>
          <label className="field">
            <span>Anything else that defines a good account</span>
            <textarea
              rows="3"
              value={icp.notes}
              onChange={(e) => setIcpField("notes", e.target.value)}
              disabled={running}
            />
          </label>
        </div>
      )}

      {panel === "weights" && (
        <div className="panel">
          <p className="hint">
            The model scores each dimension 0 to 5 from the evidence it found. These
            weights turn those into the score out of 100. Change them after a run and
            the list re-ranks without spending another call.
          </p>
          <div className="row3">
            {WEIGHT_KEYS.map((w) => (
              <label className="field" key={w.key}>
                <span>
                  {w.label}
                  <em>
                    {totalWeight
                      ? ` ${Math.round(((Number(weights[w.key]) || 0) / totalWeight) * 100)}%`
                      : ""}
                  </em>
                </span>
                <input
                  type="number" min="0" max="100"
                  value={weights[w.key]}
                  onChange={(e) =>
                    setWeights((p) => ({ ...p, [w.key]: Number(e.target.value) }))
                  }
                />
                <small>{w.help}</small>
              </label>
            ))}
          </div>
          <label className="field">
            <span>Draft an email at a score of {draftMin} or above</span>
            <input
              type="range" min="0" max="100" step="5"
              value={draftMin}
              onChange={(e) => setDraftMin(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      {panel === "email" && (
        <div className="panel">
          <p className="hint">
            Every email is sent from Dr. Ravi Hariprasad, opens on a detail found on
            that practice&apos;s own site, and states plainly that Flow does not diagnose,
            treat or replace clinical judgement. Use this to steer the angle.
          </p>
          <label className="field">
            <span>Angle for this batch, optional</span>
            <textarea
              rows="3"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="For example: lead with the billing side for practices already doing collaborative care."
            />
          </label>
        </div>
      )}

      <p className="status">
        {running && <span className="spin" />}
        {status}
      </p>
      {err && <div className="err">{err}</div>}

      <div className="stages">
        {STAGES.map(([t, d], i) => (
          <div
            key={t}
            className={`stage${stage === i ? " on" : ""}${stage > i ? " done" : ""}`}
          >
            <div className="n">Step {i + 1}</div>
            <div className="t">{t}</div>
            <div className="d">{d}</div>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="resulthead">
          <div className="filters">
            {[
              ["all", `All ${counts.all}`],
              ["fit", `In ICP ${counts.fit}`],
              ["pending", `Human look ${counts.pending}`],
              ["nofit", `Out ${counts.nofit}`],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`chip${filter === k ? " on" : ""}`}
                onClick={() => setFilter(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="ghost" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      )}

      <div className="grid">
        {view.map(({ r, i, score, verdict }) => (
          <div key={r.placeId || i} className={`card ${verdict || ""}`}>
            <div className="cardtop">
              <div>
                <p className="pname">{r.name}</p>
                <p className="pmeta">
                  {r.address}
                  {r.website ? ` · ${r.website.replace(/^https?:\/\//, "")}` : ""}
                </p>
              </div>
              {r.scores && (
                <div className="scorebox">
                  <div
                    className="ring"
                    style={{
                      background: `conic-gradient(var(--ring) ${score * 3.6}deg, var(--line) 0)`,
                    }}
                  >
                    <span>{score}</span>
                  </div>
                  <div className={`tier t-${tierFor(score)}`}>Tier {tierFor(score)}</div>
                </div>
              )}
            </div>

            {verdict && (
              <span className={`verdict v-${verdict}`}>
                {verdict === "nofit" && r.disqualified
                  ? "Disqualified"
                  : VERDICT_LABEL[verdict]}
              </span>
            )}
            {r.estimatedClinicians != null && (
              <span className="verdict v-meta">
                {r.estimatedClinicians} clinician{r.estimatedClinicians === 1 ? "" : "s"}
              </span>
            )}

            {r.reason && (
              <div className="reason">
                <div className="rh">Agent reasoning</div>
                {r.reason}
                {r.disqualifier ? ` Disqualifier: ${r.disqualifier}` : ""}
              </div>
            )}

            {r.scores && (
              <div className="bars">
                {WEIGHT_KEYS.map((w) => (
                  <div className="bar" key={w.key} title={w.help}>
                    <span className="bl">{w.label}</span>
                    <span className="bt">
                      {[0, 1, 2, 3, 4].map((n) => (
                        <i key={n} className={n < r.scores[w.key] ? "on" : ""} />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {r.signals?.length > 0 && (
              <ul className="signals">
                {r.signals.map((s, n) => (
                  <li key={n}>{s}</li>
                ))}
              </ul>
            )}

            {r.state && !["done", "qualified", "queued"].includes(r.state) && (
              <p className="work">
                <span className="spin" />
                {r.state}
              </p>
            )}

            {r.readOk === false && (
              <p className="src">
                {(r.readNote || "Site could not be read").replace(/\.$/, "")}, so
                qualification ran on the listing alone.
              </p>
            )}

            {r.draft && (
              <>
                <div className="draft">
                  <div className="dh">Drafted for Ravi to edit</div>
                  <div className="dsubject">{r.subject}</div>
                  {r.draft}
                </div>
                <p className="src">
                  {r.email
                    ? `Published openly on their site: ${r.email}`
                    : "No address published on their site. Flagged for lookup rather than guessing one."}
                </p>
                <div className="actions">
                  <button className="ghost" onClick={() => copyEmail(i, r)}>
                    {copied === i ? "Copied" : "Copy email"}
                  </button>
                  {r.email && (
                    <a
                      className="ghost"
                      href={`mailto:${r.email}?subject=${encodeURIComponent(
                        r.subject || ""
                      )}&body=${encodeURIComponent(r.draft)}`}
                    >
                      Open in mail
                    </a>
                  )}
                  <button
                    className="ghost"
                    onClick={() => draftFor(i)}
                    disabled={running || r.state === "drafting"}
                  >
                    Rewrite
                  </button>
                </div>
              </>
            )}

            {!r.draft && verdict === "fit" && !running && r.state === "qualified" && (
              <div className="actions">
                <button className="ghost" onClick={() => draftFor(i)}>
                  Draft an email
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="note">
        <strong>How this runs.</strong> Sourcing is a live Google Maps query through
        SerpApi. Each practice&apos;s website is fetched and read at run time, including
        an about or team page where one is linked. Qualification and drafting are live
        model calls, so results differ between runs. Scores are the model&apos;s
        evidence-bound judgement on each dimension, combined with the weights you set.
        Contact addresses are only shown where a practice publishes one openly on its own
        site; where none exists the agent flags it for a lookup rather than inventing one.
      </div>

      <footer>Built by Vimal Cherangattu.</footer>
    </main>
  );
}
