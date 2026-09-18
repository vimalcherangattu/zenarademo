export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  const { query, location, limit = 8 } = await req.json();

  const key = process.env.SERPAPI_API_KEY;
  if (!key) {
    return Response.json(
      { error: "SERPAPI_API_KEY is not set on the server." },
      { status: 500 }
    );
  }

  const params = new URLSearchParams({
    engine: "google_maps",
    type: "search",
    q: `${query} ${location}`.trim(),
    api_key: key,
  });

  try {
    const r = await fetch(`https://serpapi.com/search?${params}`);
    const data = await r.json();

    if (data.error) {
      return Response.json({ error: data.error }, { status: 502 });
    }

    const raw = data.local_results || data.place_results || [];
    const list = Array.isArray(raw) ? raw : [raw];

    const places = list.slice(0, limit).map((p) => ({
      name: p.title || "Unknown",
      address: p.address || "",
      phone: p.phone || "",
      website: p.website || "",
      rating: p.rating ?? null,
      reviews: p.reviews ?? null,
      type: p.type || "",
      placeId: p.place_id || "",
    }));

    return Response.json({ places, count: places.length });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
}
