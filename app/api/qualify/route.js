export const runtime = "nodejs";
export const maxDuration = 60;

const ICP = `Solo and small-group private psychiatry practices, roughly 2 to 15 clinicians, where the practice owner decides their own tooling without a hospital or health-system committee. Hospital-affiliated departments, large multi-site systems, and practices outside the target metro are not a fit.`;

export async function POST(req) {
  const { practice, siteText, region } = await req.json();

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
  }

  const prompt = `You qualify B2B leads against an ideal customer profile.

ICP: ${ICP}
Target region: ${region || "New York City"}

Practice name: ${practice.name}
Listed address: ${practice.address || "not listed"}
Listed type: ${practice.type || "not listed"}
Website: ${practice.website || "none listed"}

Text from their public website (may be empty if the site could not be read):
"""
${(siteText || "").slice(0, 5000)}
"""

Decide fit. Rules:
- Base every signal on the text above. Never invent a clinician count, a specialty, or a fact that is not present.
- If the site text is empty or uninformative, say so and return "pending".
- Use "nofit" for hospital or health-system affiliated practices, large multi-site organisations, practices clearly outside the target region, or providers who are not psychiatry.
- Use "pending" when the evidence genuinely does not settle practice size.

Return JSON only, no markdown fence:
{"verdict":"fit"|"nofit"|"pending","reason":"one or two plain sentences citing the specific evidence","signals":["short factual signal drawn from the text","another"]}`;

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
        max_tokens: 600,
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
      .replace(/```json|```/g, "")
      .trim();

    try {
      return Response.json(JSON.parse(text));
    } catch {
      return Response.json({
        verdict: "pending",
        reason: "Could not parse the qualification response.",
        signals: [],
      });
    }
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
}
