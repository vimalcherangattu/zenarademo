export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE_SIZE = 20;
const MAX_PAGES = 3;

function normalise(p) {
  return {
    name: p.title || "Unknown",
    address: p.address || "",
    phone: p.phone || "",
    website: p.website || "",
    rating: p.rating ?? null,
    reviews: p.reviews ?? null,
    type: p.type || (Array.isArray(p.types) ? p.types[0] : "") || "",
    placeId: p.place_id || "",
    mapsUrl:
      p.place_id_search ||
      (p.place_id
        ? `https://www.google.com/maps/place/?q=place_id:${p.place_id}`
        : ""),
  };
}

export async function POST(req) {
  const { specialty, region, limit = 12 } = await req.json();

  const key = process.env.SERPAPI_API_KEY;
  if (!key) {
    return Response.json(
      { error: "SERPAPI_API_KEY is not set on the server." },
      { status: 500 }
    );
  }

  const q = `${specialty || "psychiatry"} ${region || ""}`.trim();
  const want = Math.min(Math.max(Number(limit) || 12, 1), 60);
  const pages = Math.min(Math.ceil(want / PAGE_SIZE), MAX_PAGES);

  const seen = new Set();
  const places = [];

  try {
    for (let page = 0; page < pages && places.length < want; page++) {
      const params = new URLSearchParams({
        engine: "google_maps",
        type: "search",
        q,
        hl: "en",
        google_domain: "google.com",
        start: String(page * PAGE_SIZE),
        api_key: key,
      });

      const r = await fetch(`https://serpapi.com/search?${params}`, {
        signal: AbortSignal.timeout(25000),
      });
      const data = await r.json();

      if (data.error) {
        // A later page running out of results is not a failure.
        if (places.length) break;
        return Response.json({ error: data.error }, { status: 502 });
      }

      const raw = data.local_results || data.place_results || [];
      const list = Array.isArray(raw) ? raw : [raw];
      if (!list.length) break;

      for (const p of list) {
        const item = normalise(p);
        const dedupeKey =
          item.placeId ||
          `${item.name.toLowerCase()}|${item.address.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        places.push(item);
        if (places.length >= want) break;
      }
    }

    return Response.json({ places, count: places.length, query: q });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
