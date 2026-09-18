export const runtime = "nodejs";
export const maxDuration = 60;

import { callClaude, extractJson } from "../../lib/anthropic";
import { describeIcp, DEFAULT_ICP, scoreFrom, WEIGHT_KEYS } from "../../lib/icp";

const SUB_SCORE_GUIDE = `
size          0 = clearly outside the clinician band, 5 = squarely inside it
independence  0 = hospital or health-system owned, 5 = clearly owner-operated private practice
specialty     0 = not the target specialty at all, 5 = the target specialty is the core of the practice
region        0 = clearly outside the target region, 5 = clearly inside it
modernity     0 = no sign of any modern care model, 5 = several clear signals
reachability  0 = no named owner and no way to reach anyone, 5 = named owner and a published contact route`;

export async function POST(req) {
  const body = await req.json();
  const practice = body.practice || {};
  const icp = { ...DEFAULT_ICP, ...(body.icp || {}) };
  const enrichment = body.enrichment || {};

  const prompt = `You qualify B2B leads for an account-based outreach programme. You are strict and evidence-bound.

IDEAL CUSTOMER PROFILE
${describeIcp(icp)}

THE ACCOUNT
Name: ${practice.name}
Listed address: ${practice.address || "not listed"}
Listed category: ${practice.type || "not listed"}
Website: ${practice.website || "none listed"}
Google rating: ${practice.rating ?? "n/a"} from ${practice.reviews ?? "n/a"} reviews

EVIDENCE PULLED FROM THEIR OWN WEBSITE
Pages read: ${enrichment.pagesRead || 0}
Named clinicians found on the site (regex heuristic, may miss people or catch non-clinicians): ${
    (enrichment.clinicians || []).join("; ") || "none detected"
  }
Care-model and platform signals detected: ${
    (enrichment.techSignals || []).join(", ") || "none detected"
  }
Published contact address: ${enrichment.email || "none published"}

Website text:
"""
${(enrichment.text || "").slice(0, 9000)}
"""

RULES
- Every signal and every score must rest on the evidence above. Never invent a clinician count, a specialty, an affiliation or any other fact.
- The clinician list is a heuristic. Treat it as weak evidence and say so if it is all you have.
- Set "disqualified" to true only for a hard, evidenced breach of the profile: hospital or health-system ownership when independence is required, a large multi-site organisation, the wrong specialty, or a location clearly outside the target region.
- Use verdict "pending" when the evidence genuinely does not settle practice size or ownership. Do not guess your way to a verdict.
- Score each dimension 0 to 5 using this guide:${SUB_SCORE_GUIDE}
- If a dimension has no evidence either way, score it 2 and say so in the reason.
- The hook must be one concrete, verifiable detail about THIS practice that an email could open with. If nothing specific exists, return an empty string.

Return JSON only, no markdown fence, no commentary:
{"verdict":"fit"|"nofit"|"pending",
 "disqualified":true|false,
 "disqualifier":"short reason or empty string",
 "estimatedClinicians":number|null,
 "clinicianBasis":"how you arrived at that number, or why you could not",
 "scores":{${WEIGHT_KEYS.map((w) => `"${w.key}":0-5`).join(",")}},
 "reason":"two plain sentences citing the specific evidence",
 "signals":["short factual signal drawn from the evidence","another"],
 "hook":"one concrete detail about this practice to open an email with"}`;

  const { text, error } = await callClaude({ prompt, maxTokens: 900 });
  if (error) return Response.json({ error }, { status: 502 });

  const parsed = extractJson(text);
  if (!parsed) {
    return Response.json({
      verdict: "pending",
      disqualified: false,
      scores: null,
      score: 0,
      reason: "The qualification response could not be parsed. Worth a human look.",
      signals: [],
      hook: "",
    });
  }

  const scores = {};
  for (const { key } of WEIGHT_KEYS) {
    const v = Number(parsed.scores?.[key]);
    scores[key] = Number.isFinite(v) ? Math.min(5, Math.max(0, v)) : 0;
  }

  return Response.json({
    verdict: ["fit", "nofit", "pending"].includes(parsed.verdict)
      ? parsed.verdict
      : "pending",
    disqualified: Boolean(parsed.disqualified),
    disqualifier: parsed.disqualifier || "",
    estimatedClinicians:
      typeof parsed.estimatedClinicians === "number"
        ? parsed.estimatedClinicians
        : null,
    clinicianBasis: parsed.clinicianBasis || "",
    scores,
    score: scoreFrom(scores, body.weights),
    reason: parsed.reason || "",
    signals: Array.isArray(parsed.signals) ? parsed.signals.slice(0, 6) : [],
    hook: parsed.hook || "",
  });
}
