// Thin wrapper over the Messages API. Server-side only.

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

// Thinking is on by default on current models and its tokens count against
// max_tokens, so these budgets have to leave room for it or the JSON gets
// truncated before it is emitted.
export async function callClaude({
  prompt,
  maxTokens = 4000,
  effort = "medium",
  system,
}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { error: "ANTHROPIC_API_KEY is not set on the server." };
  }

  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort },
    messages: [{ role: "user", content: prompt }],
  };
  if (system) body.system = system;

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  };
  // An org-level key has to name a workspace; a workspace-scoped key does not.
  if (process.env.ANTHROPIC_WORKSPACE_ID) {
    headers["anthropic-workspace-id"] = process.env.ANTHROPIC_WORKSPACE_ID;
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(50000),
    });

    const data = await r.json();
    if (data.error) return { error: data.error.message || "Model call failed." };

    // A refusal returns 200 with no usable text, so check before reading content.
    if (data.stop_reason === "refusal") {
      return {
        error: `The model declined this request${
          data.stop_details?.category ? ` (${data.stop_details.category})` : ""
        }.`,
      };
    }

    // Thinking blocks are skipped here; only text blocks carry the answer.
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (data.stop_reason === "max_tokens" && !text) {
      return { error: "The response hit the token limit before any output." };
    }

    return { text, truncated: data.stop_reason === "max_tokens" };
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
