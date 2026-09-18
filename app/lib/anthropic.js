// Thin wrapper over the Messages API. Server-side only.

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export async function callClaude({ prompt, maxTokens = 700, system }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { error: "ANTHROPIC_API_KEY is not set on the server." };
  }

  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };
  if (system) body.system = system;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(50000),
    });

    const data = await r.json();
    if (data.error) return { error: data.error.message || "Model call failed." };

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return { text };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

// Models occasionally wrap JSON in prose or a fence. Pull out the first
// balanced object rather than trusting the whole response to parse.
export function extractJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
