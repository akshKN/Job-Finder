# Shortlist: a personal job feed

Pulls fresh job postings from employers' own careers pages and a few job
aggregators, filters them to your preferences, and shows them in a
phone-friendly web app with a direct Apply link on every posting.

- `docs/` is the app (what GitHub Pages serves).
- `scripts/fetch-jobs.mjs` collects postings into `docs/data/jobs.json`.
- `.github/workflows/update-jobs.yml` runs it every 3 hours and republishes the site.
- `.github/workflows/daily-digest.yml` emails new matches each morning (optional).

## One-time setup (about 10 minutes)

1. Create a new **public** repository on GitHub (for example `job-finder`) and
   upload everything in this folder, including the hidden `.github` folder.
   GitHub Pages on a free account needs a public repo, so the job titles and
   locations in `config/` are visible to anyone who finds the repo. Saved,
   applied and hidden postings never leave her phone.
2. In the repo: **Settings → Pages → Source → GitHub Actions**.
3. **Actions → Update jobs → Run workflow.** After a minute or two the site is
   live at `https://<your-username>.github.io/<repo-name>/`.
4. On her iPhone: open that address in Safari → Share → **Add to Home Screen**.

## Tell it what to look for

Edit `config/preferences.json`:

| Setting | Meaning |
| --- | --- |
| `titleKeywords` | Job titles to keep, e.g. `["data analyst", "business analyst"]`. Empty keeps every title from the listed companies. |
| `keywords` | Search terms for the aggregators. Leave empty to reuse `titleKeywords`. |
| `excludeKeywords` | Titles to drop, e.g. `["intern", "contract"]`. |
| `locations` | Cities or states, e.g. `["Dallas", "Plano", "TX"]`. Also used for aggregator searches. |
| `includeRemote` / `remoteOnly` | Whether remote roles pass the location filter. |
| `minSalary`, `requireSalary` | Minimum yearly pay; whether to hide postings with no pay listed. |
| `maxAgeDays` | Default "posted within" window in the app. `0` means any age. |
| `skillKeywords` | Skills to look for in the description. A posting naming one is kept even if its title is generic ("Programmer Analyst"). |
| `fullTimeOnly` | Hide contract, part-time, temporary and internship postings. |
| `hideRestricted` | Hide postings that say they need US citizenship or a security clearance. |
| `targetCompanies` | Employers to flag with a "Target company" tag, a one-tap filter, and their own search buttons. |
| `levels` | Any of `intern`, `entry`, `mid`, `senior`, `director`. Empty means all. |

These are the starting filters. She can change any of them in the app's
Filters panel, and her changes stay on her device.

## Tailor a resume to a posting

Each posting has a **Tailor resume** button. She pastes her resume once (it is
saved on her phone only, never in this repo), and the app shows which of the
posting's key terms her resume already covers and which it doesn't. **Copy
tailoring request** then copies a ready-made request (posting, resume and
rules: nothing invented, changes listed, draft for review) to paste into
Claude or another AI assistant, which writes the tailored draft for her to
review before applying. Aggregators share only an excerpt of each description,
so paste the full text from the posting for an accurate check.

## Postings from LinkedIn, Indeed and other sites

Those sites don't allow automated collection, so the app doesn't pull from
them. Set up their own emailed job alerts, and when she finds a posting there,
**Saved → Add a posting from another site** stores its link so it can be
tailored and tracked like the rest. These stay on her phone.

## Add employers to watch

Edit `config/sources.json`. Each company needs the hiring system it uses and
its token, which is the last part of its careers address:

| System | Careers address looks like |
| --- | --- |
| `greenhouse` | `boards.greenhouse.io/<token>` or `job-boards.greenhouse.io/<token>` |
| `lever` | `jobs.lever.co/<token>` |
| `ashby` | `jobs.ashbyhq.com/<token>` |
| `smartrecruiters` | `jobs.smartrecruiters.com/<token>` |

Not sure which one a company uses? Run `node scripts/find-company.mjs <name>`
and paste the line it prints. The list starts empty: the current target
companies (IBM, LTIMindtree, Infosys, Cognizant, Tech Mahindra, CVS Health,
American Express) run their own careers systems, so their postings reach the
feed through Jooble and are flagged as target companies there.

Employers on Workday, iCIMS or a home-built site can't be watched directly.
Their jobs still arrive through the aggregators and the LinkedIn / Indeed /
Google buttons at the bottom of the app.

## Turn on the job search source (free)

The feed's main source is **Jooble**, a job search engine that covers many job
boards and employer sites. Its key is free: request one at
jooble.org/api/about (it arrives by email), then add it under **Settings →
Secrets and variables → Actions → Secrets** as `JOOBLE_API_KEY`. The free key
allows 100 requests a day; the feed uses about 30. Jooble shares a short
excerpt of each posting, and each Apply link opens the posting through Jooble.

Other sources in `config/sources.json`:

- **Remotive** (remote jobs): on, no key needed. Checked three times a day at
  most, and postings link back to Remotive, as its terms ask.
- **Adzuna**: off. It now charges for ongoing access. To use it, set
  `"enabled": true` and add `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`.
- **USAJOBS** (federal jobs): off. Free key from developer.usajobs.gov; add
  `USAJOBS_API_KEY` and `USAJOBS_EMAIL` and set `"enabled": true`.

## Turn on the daily email (optional)

Add secrets `SMTP_USER` (a Gmail address), `SMTP_PASS` (a Gmail *app
password*, not the normal password) and `DIGEST_TO` (where to send it). Under
**Variables**, add `SITE_URL` with the site address. Other mail providers work
through the `SMTP_HOST` and `SMTP_PORT` variables.

## How it avoids missing or losing postings

- Company sources return every open posting, so nothing depends on a search
  engine's ranking.
- If a source fails, its last known postings stay in the feed and the app shows
  a warning naming the source.
- If every source fails, the run stops without touching the feed, and GitHub
  emails you about the failed run.
- The same job found in two places is shown once, preferring the employer's
  own page.

No tool can promise complete coverage: a job posted only on LinkedIn, or by an
employer you haven't listed whose title the aggregators don't surface, won't
appear. The search buttons in the app cover that gap.

## Checking it locally

    node test/run.mjs        # tests, using stand-in API responses
    npm run sample           # rebuild the sample feed
    node scripts/fetch-jobs.mjs   # real fetch (needs internet)
    npx serve docs           # view the app
