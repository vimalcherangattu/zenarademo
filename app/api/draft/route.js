export const runtime = "nodejs";
export const maxDuration = 60;

const CONTEXT = `Zenara Flow helps psychiatry practices extend care beyond the monthly office visit: organising clinical signal between visits, preparing the clinician before a visit, and making that continuous work billable. It is built by a practising psychiatrist, Dr. Ravi Hariprasad. It does not diagnose, does not treat, and does not replace clinical judgement. Assess, the pre-visit assessment module, is the part available today.`;

export async function POST(req) {
  const { practice, signals } = await req.json();

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
  }

  const prompt = `Write a short first-touch email from Dr. Ravi Hariprasad, a practising psychiatrist and founder of Zenara Health, to this practice.

About Zenara: ${CONTEXT}

Recipient practice: ${practice.name}
Location: ${practice.address || "not listed"}
Signals observed on their own public website:
${(signals || []).map((s) => "- " + s).join("\n") || "- none recorded"}

Rules:
- Subject line on the first line, then the body. Under 120 words total.
- Open with something specific to THIS practice drawn from the signals. Never a generic opener.
- Peer to peer, one psychiatrist writing to another practice. Plain, unsalesy.
- State plainly that Flow does not diagnose, treat, or replace clinical judgement.
- Ask for a short conversation. Do not offer a demo or a deck.
- No em dashes. No exclamation marks. Do not invent metrics, patient numbers, or any fact not given above.
- Sign off as Ravi.

Return the email text only.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await r.json();
    if (data.error) {
      return Response.json({ error: data.error.message }, { status: 502 });
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
}
