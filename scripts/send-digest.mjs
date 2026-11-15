#!/usr/bin/env node
// Emails the postings first seen in the last day that match the saved
// preferences. Does nothing (and does not fail) until the mail secrets are set.
//
// Needs: SMTP_USER, SMTP_PASS, DIGEST_TO. Optional: SMTP_HOST, SMTP_PORT,
// SITE_URL, DIGEST_HOURS.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matches, prefsToFilters, jobDate } from '../docs/filter.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const html = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => `$${Math.round(n / 1000)}k`;

export function pickDigestJobs(data, hours, now = Date.now()) {
  const f = prefsToFilters(data.defaults);
  const since = now - hours * 3600000;
  return data.jobs.filter((j) => new Date(j.firstSeen || jobDate(j)).getTime() >= since && matches(j, f, now));
}

export function renderDigest(jobs, siteUrl) {
  const rows = jobs
    .map((j) => {
      const pay = j.salaryMin || j.salaryMax ? ` · ${money(j.salaryMin || j.salaryMax)}–${money(j.salaryMax || j.salaryMin)}` : '';
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #e3e7e4">
<div style="font-size:16px;font-weight:600;color:#17231f">${html(j.title)}</div>
<div style="font-size:14px;color:#5d6b66;margin:2px 0 8px">${html(j.company)} · ${html(j.location || (j.remote ? 'Remote' : 'Location not listed'))}${pay}</div>
<a href="${html(j.url)}" style="font-size:14px;color:#0f5f4f;font-weight:600">Apply on ${html(j.direct ? j.company : j.via)} →</a>
</td></tr>`;
    })
    .join('');
  const link = siteUrl ? `<p style="margin-top:20px"><a href="${html(siteUrl)}" style="color:#0f5f4f">Open the full feed</a></p>` : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto">
<h2 style="color:#17231f">${jobs.length} new job posting${jobs.length === 1 ? '' : 's'}</h2>
<table style="width:100%;border-collapse:collapse">${rows}</table>${link}</div>`;
}

async function main() {
  const missing = ['SMTP_USER', 'SMTP_PASS', 'DIGEST_TO'].filter((k) => !env[k]);
  if (missing.length) {
    console.log(`Daily email is off. To turn it on, add the secrets: ${missing.join(', ')}.`);
    return;
  }
  const data = JSON.parse(await readFile(resolve(env.JOBS_OUT || `${ROOT}/docs/data/jobs.json`), 'utf8'));
  if (data.sample) return console.log('Feed still has sample postings. No email sent.');
  const jobs = pickDigestJobs(data, Number(env.DIGEST_HOURS) || 25).slice(0, 60);
  if (!jobs.length) return console.log('No new matching postings. No email sent.');

  const { default: nodemailer } = await import('nodemailer');
  const port = Number(env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await transport.sendMail({
    from: `Job feed <${env.SMTP_USER}>`,
    to: env.DIGEST_TO,
    subject: `${jobs.length} new job posting${jobs.length === 1 ? '' : 's'} today`,
    html: renderDigest(jobs, env.SITE_URL),
  });
  console.log(`Sent ${jobs.length} postings to ${env.DIGEST_TO.split(',').length} recipient(s).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
