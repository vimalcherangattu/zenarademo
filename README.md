# Practice Finder

An account-based outreach tool for Zenara Health. Give it a specialty and a US
region. It searches Google Maps, reads each practice's own website, scores every
practice against an ICP you define, and drafts an icebreaker from Dr. Ravi
Hariprasad for the ones that clear your bar.

It stops at drafted. Nothing is sent automatically.

## Pipeline

1. **Source** - SerpApi Google Maps engine, live query, paginated and deduped
2. **Read site** - Jina Reader fetches the homepage plus a linked about, team or
   contact page, and pulls out published contact addresses, named clinicians and
   care-model signals
3. **Qualify** - Claude scores six dimensions 0 to 5 against your ICP, citing
   evidence from the fetched pages, and flags hard disqualifiers
4. **Draft** - Claude writes a first-touch note that opens on a detail specific
   to that practice

Steps 2 to 4 run with bounded parallelism, so a batch of twelve takes about as
long as a batch of four used to.

## Defining the ICP

Everything the qualifier judges against is editable in the UI, and everything is
passed through to the model on each run:

| Field | Default |
|---|---|
| Specialty | Psychiatry |
| Region | any US metro you type |
| Clinician band | 2 to 15 |
| Independent only | on, which disqualifies hospital and health-system practices |
| Positive signals | outpatient psychiatry, private practice, accepting new patients |
| Disqualifying signals | hospital, health system, academic medical center, inpatient only, urgent care |
| Free-text notes | anything else that defines a good account |

## Scoring

The model scores six dimensions from the evidence it found. Those are combined
with weights you control to give a score out of 100 and a tier from A to D.

| Dimension | Default weight |
|---|---|
| Practice size | 30 |
| Independence | 25 |
| Specialty match | 20 |
| Region match | 10 |
| Care model fit | 10 |
| Reachability | 5 |

Weights are applied in the browser, so changing them after a run re-ranks the
list instantly without spending another API call. A practice only gets an email
drafted if it clears the threshold you set, defaulting to 60.

Results can be filtered by verdict and exported to CSV, including the drafted
subject line and body.

## Environment variables

    SERPAPI_API_KEY=...       # required, Google Maps sourcing
    ANTHROPIC_API_KEY=...     # required, qualification and drafting
    ANTHROPIC_MODEL=...       # optional, defaults to claude-opus-5
    JINA_API_KEY=...          # optional, raises the site-reading rate limit

See `.env.example`.

## Run locally

    npm install
    npm run dev

## Deploy

Push to a repo and import into Vercel, or `vercel deploy`. Set the two required
environment variables in the Vercel project settings before the first run.

Note that the API routes are unauthenticated. Anyone who can reach a public
deployment can spend your SerpApi and Anthropic credits, so put the deployment
behind Vercel's password protection or an auth layer before sharing the URL.

## Design notes

- Contact addresses are only surfaced where a practice publishes one openly on
  its own site. The agent never guesses or pattern-matches an address.
- The clinician list is a regex heuristic over the site text. It is handed to the
  qualifier as weak evidence and labelled as such in the prompt, so the model
  does not treat it as an authoritative headcount.
- Qualification prompts forbid inventing clinician counts, affiliations or any
  fact not present in the fetched page text.
- Practices whose evidence does not settle size or ownership are marked "pending"
  for a human look rather than being force-classified.
- Every draft has to state plainly that Flow does not diagnose, treat or replace
  clinical judgement.

## On the sourcing API

SerpApi is used because it returns Google Maps results without a Places API
contract and needs no billing setup. Reasonable alternatives if volume grows:

- **Google Places API** directly. Cheapest at scale and first-party, but it needs
  a billing account and its terms restrict how long results may be stored.
- **Outscraper** or **Apify** Google Maps scrapers. Better at bulk export and
  returning more fields per place, slower per call.
- **Exa** or **Nimble** for the reading step, in place of Jina, if you want
  search-driven enrichment for practices that have no website at all.

The sourcing step is one route with one response shape, so swapping it is a
contained change.
