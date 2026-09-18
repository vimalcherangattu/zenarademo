// Shared ICP definition, scoring weights and score maths.
// Imported by both the API routes and the client, so it stays free of
// server-only dependencies.

export const DEFAULT_ICP = {
  specialty: "Psychiatry",
  region: "New York, NY",
  minClinicians: 2,
  maxClinicians: 15,
  independentOnly: true,
  mustHave: ["outpatient psychiatry", "private practice", "accepting new patients"],
  exclude: [
    "hospital",
    "health system",
    "academic medical center",
    "inpatient only",
    "urgent care",
  ],
  notes:
    "The practice owner decides their own tooling without a hospital or health-system committee. Practices already running measurement-based care, collaborative care or telepsychiatry are a stronger fit.",
};

// Each dimension is scored 0-5 by the model, then weighted here.
export const WEIGHT_KEYS = [
  {
    key: "size",
    label: "Practice size",
    help: "Clinician count sits inside the target band",
  },
  {
    key: "independence",
    label: "Independence",
    help: "Owner-operated, not part of a hospital or health system",
  },
  {
    key: "specialty",
    label: "Specialty match",
    help: "Genuinely practises the target specialty",
  },
  {
    key: "region",
    label: "Region match",
    help: "Located inside the target region",
  },
  {
    key: "modernity",
    label: "Care model fit",
    help: "Signals of measurement-based, collaborative or virtual care",
  },
  {
    key: "reachability",
    label: "Reachability",
    help: "A named owner and a published way to reach them",
  },
];

export const DEFAULT_WEIGHTS = {
  size: 30,
  independence: 25,
  specialty: 20,
  region: 10,
  modernity: 10,
  reachability: 5,
};

export const DEFAULT_DRAFT_MIN_SCORE = 60;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function scoreFrom(subScores, weights) {
  if (!subScores) return 0;
  let earned = 0;
  let possible = 0;
  for (const { key } of WEIGHT_KEYS) {
    const w = Number(weights?.[key]);
    if (!Number.isFinite(w) || w <= 0) continue;
    const s = clamp(Number(subScores[key]) || 0, 0, 5);
    earned += w * s;
    possible += w * 5;
  }
  return possible ? Math.round((earned / possible) * 100) : 0;
}

export function tierFor(score) {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

// The model returns a verdict, but a hard disqualifier always wins and a
// score below the draft threshold never reaches the drafting stage.
export function verdictFor(row, score, draftMinScore) {
  if (row.disqualified) return "nofit";
  if (row.verdict === "pending") return "pending";
  if (row.verdict === "nofit") return "nofit";
  return score >= draftMinScore ? "fit" : "nofit";
}

export function describeIcp(icp) {
  const lines = [
    `Specialty: ${icp.specialty || "any"}`,
    `Target region: ${icp.region || "anywhere in the United States"}`,
    `Practice size: ${icp.minClinicians} to ${icp.maxClinicians} clinicians`,
    `Ownership: ${
      icp.independentOnly
        ? "independent and owner-operated only. Hospital-owned, health-system affiliated and large multi-site groups are disqualified."
        : "any ownership model is acceptable."
    }`,
  ];
  if (icp.mustHave?.length) {
    lines.push(`Positive signals to look for: ${icp.mustHave.join(", ")}`);
  }
  if (icp.exclude?.length) {
    lines.push(`Disqualifying signals: ${icp.exclude.join(", ")}`);
  }
  if (icp.notes?.trim()) {
    lines.push(`Additional notes from the operator: ${icp.notes.trim()}`);
  }
  return lines.join("\n");
}
