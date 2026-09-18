export const runtime = "nodejs";
export const maxDuration = 60;

// Reads a practice's public website via Jina Reader (free, no key)
// and pulls out any openly published contact email.
export async function POST(req) {
  const { website } = await req.json();

  if (!website) {
    return Response.json({ text: "", email: null, ok: false });
  }

  const url = website.startsWith("http") ? website : `https://${website}`;

  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(25000),
    });

    if (!r.ok) {
      return Response.json({ text: "", email: null, ok: false });
    }

    const full = await r.text();
    const text = full.slice(0, 6000);

    // Only take an address the practice publishes itself. Never guess one.
    const found = full.match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    );
    const email =
      (found || []).find(
        (e) =>
          !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e) &&
          !/(sentry|wixpress|example|godaddy|squarespace)/i.test(e)
      ) || null;

    return Response.json({ text, email, ok: true });
  } catch (e) {
    return Response.json({ text: "", email: null, ok: false });
  }
}
