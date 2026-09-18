export const runtime = "nodejs";
export const maxDuration = 60;

// Reads a practice's own website through Jina Reader and pulls out the
// evidence the qualifier needs: page text, an openly published contact
// address, named clinicians and any care-model signals.

const EXTRA_PATHS = ["/about", "/our-team", "/team", "/contact", "/providers"];
const MAX_EXTRA_PAGES = 2;
const PER_PAGE_CHARS = 5000;
const TOTAL_CHARS = 11000;

// Platforms and care models worth opening an email with.
const TECH_SIGNALS = [
  ["SimplePractice", /simplepractice/i],
  ["Osmind", /osmind/i],
  ["Luminello", /luminello/i],
  ["Valant", /valant/i],
  ["Tebra or Kareo", /\b(tebra|kareo)\b/i],
  ["Athenahealth", /athenahealth/i],
  ["Headway", /\bheadway\b/i],
  ["Alma", /\balma\b(?!\s*mater)/i],
  ["Zocdoc", /zocdoc/i],
  ["Spruce", /spruce\s*health/i],
  ["Doxy.me", /doxy\.me/i],
  ["Online booking", /(book (an )?appointment online|request an appointment|patient portal)/i],
  ["Telepsychiatry", /(telepsychiatry|telehealth|virtual visits?|video visits?)/i],
  ["Measurement-based care", /(measurement[- ]based care|phq-?9|gad-?7)/i],
  ["Collaborative care", /(collaborative care|coCM|care coordination)/i],
  ["Spravato or ketamine", /(spravato|ketamine)/i],
  ["TMS", /\bTMS\b|transcranial magnetic/i],
  ["Accepting new patients", /accepting new patients/i],
  ["Insurance accepted", /(we accept|in-network with|insurances? accepted)/i],
];

const CREDENTIALS =
  "MD|DO|PMHNP-BC|PMHNP|APRN|NP|PA-C|PsyD|PhD|LCSW|LMHC|LPC|LMFT";

function readerUrl(url) {
  return `https://r.jina.ai/${url}`;
}

async function readPage(url, timeout) {
  const headers = { Accept: "text/plain" };
  if (process.env.JINA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  }
  try {
    const r = await fetch(readerUrl(url), {
      headers,
      signal: AbortSignal.timeout(timeout),
    });
    if (!r.ok) return "";
    return await r.text();
  } catch {
    return "";
  }
}

function pickEmail(text) {
  const found =
    text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const clean = found.filter(
    (e) =>
      !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(e) &&
      !/(sentry|wixpress|example\.|godaddy|squarespace|sentry\.io|\.png|cloudflare)/i.test(
        e
      )
  );
  // Prefer a human-looking or front-desk address over a no-reply one.
  const preferred = clean.find((e) => !/^(no-?reply|donotreply|postmaster)/i.test(e));
  return preferred || clean[0] || null;
}

const NAME_STOP = new Set(
  `meet our the we about contact new your team staff welcome dr doctor provider
   providers psychiatrist psychiatrists clinician home call email book schedule
   read more view learn by with and is see here now today`.split(/\s+/)
);

function pickClinicians(text) {
  // Separators are spaces only, never newlines, so a heading on the line
  // above cannot bleed into the name below it.
  const re = new RegExp(
    `\\b([A-Z][a-zA-Z'’-]+(?:[ ]+[A-Z][a-zA-Z'’.-]+){1,3}),?[ ]*(?:,[ ]*)?(${CREDENTIALS})\\b`,
    "g"
  );
  const bare = (t) => t.toLowerCase().replace(/[.,]/g, "");
  const names = new Map();
  let m;
  while ((m = re.exec(text)) !== null) {
    const tokens = m[1].split(/\s+/);
    while (tokens.length > 2 && NAME_STOP.has(bare(tokens[0]))) tokens.shift();
    if (tokens.length < 2 || tokens.length > 4) continue;
    if (NAME_STOP.has(bare(tokens[0]))) continue;
    const name = tokens.join(" ");
    if (!names.has(name)) names.set(name, `${name}, ${m[2]}`);
    if (names.size >= 30) break;
  }
  return [...names.values()];
}

function pickSignals(text) {
  return TECH_SIGNALS.filter(([, re]) => re.test(text)).map(([label]) => label);
}

export async function POST(req) {
  const { website } = await req.json();

  if (!website) {
    return Response.json({
      text: "",
      email: null,
      ok: false,
      pagesRead: 0,
      clinicians: [],
      techSignals: [],
      reason: "No website listed on the Maps record.",
    });
  }

  const base = website.startsWith("http") ? website : `https://${website}`;
  let origin;
  try {
    origin = new URL(base).origin;
  } catch {
    return Response.json({
      text: "",
      email: null,
      ok: false,
      pagesRead: 0,
      clinicians: [],
      techSignals: [],
      reason: "The listed website is not a usable URL.",
    });
  }

  const home = await readPage(base, 25000);
  if (!home) {
    return Response.json({
      text: "",
      email: null,
      ok: false,
      pagesRead: 0,
      clinicians: [],
      techSignals: [],
      reason: "The site could not be read.",
    });
  }

  // Follow a couple of the pages that actually carry team and contact
  // detail, but only ones the homepage itself links to.
  const linked = EXTRA_PATHS.filter((p) =>
    new RegExp(`href="[^"]*${p}(/|"|\\?)`, "i").test(home) ||
    new RegExp(`\\]\\([^)]*${p}(/|\\)|\\?)`, "i").test(home)
  ).slice(0, MAX_EXTRA_PAGES);

  const extras = await Promise.all(
    linked.map((p) => readPage(origin + p, 15000))
  );

  const corpus = [home, ...extras].filter(Boolean);
  const text = corpus
    .map((t) => t.slice(0, PER_PAGE_CHARS))
    .join("\n\n---\n\n")
    .slice(0, TOTAL_CHARS);
  const all = corpus.join("\n");

  return Response.json({
    text,
    email: pickEmail(all),
    clinicians: pickClinicians(all),
    techSignals: pickSignals(all),
    pagesRead: corpus.length,
    ok: true,
  });
}
