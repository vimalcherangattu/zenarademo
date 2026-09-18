# Psychiatry Lead Agent

Sources psychiatry practices from a live Google Maps search, reads each practice's
public website, qualifies them against an ICP, and drafts a first-touch email for
human review. It stops at drafted; nothing is sent automatically.

## Pipeline

1. **Source** - SerpApi Google Maps engine, live query
2. **Read site** - Jina Reader (free, no key) fetches the practice's own site
3. **Qualify** - Claude decides fit against the ICP, citing evidence from the site
4. **Draft** - Claude writes a first-touch note referencing that practice specifically

## Environment variables

    SERPAPI_API_KEY=...
    ANTHROPIC_API_KEY=...

## Run locally

    npm install
    npm run dev

## Deploy

Push to a repo and import into Vercel, or `vercel deploy`. Set both environment
variables in the Vercel project settings before the first run.

## Design notes

- Contact addresses are only surfaced where a practice publishes one openly on its
  own site. The agent never guesses or pattern-matches an address.
- Qualification prompts forbid inventing clinician counts or facts not present in
  the fetched page text.
- Practices whose evidence does not settle size are marked "pending" for a human
  look rather than being force-classified.
