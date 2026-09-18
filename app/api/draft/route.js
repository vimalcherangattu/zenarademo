export const runtime = "nodejs";
export const maxDuration = 60;

import { callClaude, extractJson } from "../../lib/anthropic";

const SENDER = {
  name: "Dr. Ravi Hariprasad",
  signoff: "Ravi",
  title: "practising psychiatrist and founder of Zenara Health",
};

const PRODUCT = `Zenara Flow helps psychiatry practices extend care beyond the monthly office visit: organising clinical signal between visits, preparing the clinician before a visit, and making that continuous work billable. It is built by a practising psychiatrist, Dr. Ravi Hariprasad. It does not diagnose, does not treat, and does not replace clinical judgement. Assess, the pre-visit assessment module, is the part available today.`;

export async function POST(req) {
  const { practice = {}, signals = [], hook = "", angle = "" } = await req.json();

  const prompt = `Write a short first-touch email from ${SENDER.name}, a ${SENDER.title}, to the practice below. This is an icebreaker, not a pitch deck.

ABOUT THE SENDER'S PRODUCT
${PRODUCT}

THE RECIPIENT PRACTICE
Name: ${practice.name}
Location: ${practice.address || "not listed"}
Website: ${practice.website || "none listed"}
Estimated size: ${
    practice.estimatedClinicians
      ? `${practice.estimatedClinicians} clinicians`
      : "not established"
  }

THE OPENING DETAIL TO USE
${hook || "none recorded, open with the most specific signal below instead"}

SIGNALS OBSERVED ON THEIR OWN PUBLIC WEBSITE
${signals.length ? signals.map((s) => "- " + s).join("\n") : "- none recorded"}
${angle ? `\nANGLE THE SENDER WANTS TO TAKE\n${angle}\n` : ""}
RULES
- Under 120 words in the body. Five short paragraphs at most.
- Open with something specific to THIS practice drawn from the hook or signals. Never a generic opener, never flattery about their website.
- Peer to peer. One psychiatrist writing to another practice owner. Plain, unsalesy, no marketing register.
- State plainly, in the sender's own voice, that Flow does not diagnose, treat, or replace clinical judgement.
- Ask for a short conversation. Do not offer a demo, a deck, a trial or a calendar link.
- No em dashes. No exclamation marks. No invented metrics, patient numbers, revenue claims or any fact not given above.
- Sign off as ${SENDER.signoff}.

Return JSON only, no fence:
{"subject":"under 60 characters, specific, lowercase-ish and human","body":"the email body including the signoff"}`;

  const { text, error } = await callClaude({
    prompt,
    maxTokens: 6000,
    effort: "medium",
  });
  if (error) return Response.json({ error }, { status: 502 });

  const parsed = extractJson(text);
  if (parsed?.body) {
    return Response.json({
      subject: parsed.subject || `A question about ${practice.name}`,
      body: parsed.body.trim(),
    });
  }

  // Fall back to treating the first line as the subject.
  const lines = (text || "").split("\n").filter(Boolean);
  const first = lines[0] || "";
  const subject = /^subject\s*:/i.test(first)
    ? first.replace(/^subject\s*:\s*/i, "").trim()
    : `A question about ${practice.name}`;
  const body = /^subject\s*:/i.test(first)
    ? lines.slice(1).join("\n").trim()
    : (text || "").trim();

  return Response.json({ subject, body });
}
