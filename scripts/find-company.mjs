#!/usr/bin/env node
// Finds which hiring system a company uses, and prints the line to paste into
// config/sources.json.
//
//   node scripts/find-company.mjs stripe
//   node scripts/find-company.mjs "Acme Corp" acme acmecorp
//
// The token is the last part of the company's careers address, for example
// boards.greenhouse.io/<token>, jobs.lever.co/<token>, jobs.ashbyhq.com/<token>
// or jobs.smartrecruiters.com/<token>.
import { ATS } from './lib/sources.mjs';

const args = process.argv.slice(2);
if (!args.length) {
  console.log('Usage: node scripts/find-company.mjs <token> [more tokens to try]');
  process.exit(1);
}
const name = args[0];
const tokens = [...new Set(args.map((a) => a.toLowerCase().replace(/[^a-z0-9-]+/g, '')).concat(args))];

let hits = 0;
for (const token of tokens) {
  for (const [ats, fn] of Object.entries(ATS)) {
    try {
      const jobs = await fn({ name, token });
      if (!jobs.length) continue;
      hits++;
      console.log(`Found ${jobs.length} open postings on ${ats}. Add this to "companies":`);
      console.log(`  ${JSON.stringify({ name, ats, token })}\n`);
    } catch {
      // Not on this system; keep looking.
    }
  }
}
if (!hits) {
  console.log(`No match for ${tokens.join(', ')}. The company may use another system (Workday, iCIMS, its own site).`);
  console.log('Its jobs can still reach the feed through the aggregators.');
}
