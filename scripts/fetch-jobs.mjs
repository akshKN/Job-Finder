#!/usr/bin/env node
// Pulls postings from every configured source, tidies them into one list and
// writes docs/data/jobs.json for the app.
//
//   node scripts/fetch-jobs.mjs
//
// A source that fails or is resting between checks keeps its previous postings,
// so one bad run never empties the feed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUnits } from './lib/sources.mjs';
import { parseSalary, isRemoteText, safeUrl, pool } from './lib/util.mjs';
import { keywordMatch, phraseMatch, levelOf, splitList, jobDate } from '../docs/filter.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_DIR = resolve(process.env.JOBS_CONFIG_DIR || `${ROOT}/config`);
const OUT = resolve(process.env.JOBS_OUT || `${ROOT}/docs/data/jobs.json`);
const SAMPLE = process.env.JOBS_SAMPLE === '1';

const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (e) {
    if (fallback !== undefined && e.code === 'ENOENT') return fallback;
    throw new Error(`Could not read ${p}: ${e.message}`);
  }
};

function loadPrefs(raw) {
  return {
    ...raw,
    titleKeywords: splitList(raw.titleKeywords),
    keywords: splitList(raw.keywords),
    excludeKeywords: splitList(raw.excludeKeywords),
    locations: splitList(raw.locations),
    levels: splitList(raw.levels),
    skillKeywords: splitList(raw.skillKeywords),
    targetCompanies: (raw.targetCompanies || []).map((c) => (typeof c === 'string' ? { name: c, match: [c] } : { name: c.name, match: splitList(c.match?.length ? c.match : c.name) })),
  };
}

// Postings that say they need US citizenship or a security clearance.
const RESTRICTED = /(security clearance|secret clearance|top secret|ts\/sci|u\.?s\.? citizenship (is )?required|must be (a |an )?u\.?s\.? citizen|u\.?s\.? citizens? only|\busc\s?(\/|or)\s?gc\b|\bgc\s?(\/|or)\s?usc\b)/i;

function finalize(raw, unit, now, prefs) {
  const url = safeUrl(raw.url);
  if (!raw.title || !url) return null;
  const text = raw.text || '';
  let salaryMin = Number(raw.salaryMin) || null;
  let salaryMax = Number(raw.salaryMax) || null;
  if (!salaryMin && !salaryMax) {
    const found = parseSalary(raw.salaryText) || parseSalary(text);
    if (found) [salaryMin, salaryMax] = [found.min, found.max];
  }
  const remote = raw.remote ?? (raw.workplace === 'remote' || isRemoteText(raw.location) || /\bremote\b/i.test(raw.title));
  return {
    id: `${unit.origin}:${raw.sid}`,
    origin: unit.origin,
    title: String(raw.title).trim(),
    company: String(raw.company || unit.label).trim(),
    location: String(raw.location || '').trim(),
    remote: !!remote,
    workplace: raw.workplace || (remote ? 'remote' : null),
    salaryMin,
    salaryMax,
    postedAt: raw.postedAt || null,
    firstSeen: now,
    url,
    via: unit.via,
    direct: unit.kind === 'company',
    level: levelOf(raw.title),
    type: raw.type || null,
    snippet: text.slice(0, 220),
    text: text.slice(0, 6000),
    skills: prefs.skillKeywords.filter((k) => phraseMatch(`${raw.title} ${text}`, k)),
    restricted: RESTRICTED.test(`${raw.title} ${text}`),
    target: prefs.targetCompanies.some((c) => c.match.some((m) => keywordMatch(raw.company || unit.label, m))),
    p: unit.priority,
  };
}

const squash = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|the)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');

// Same company + same title + same city = the same job, even from two sources.
function dedupe(jobs) {
  const byKey = new Map();
  for (const j of jobs) {
    const city = j.remote && !j.location ? 'remote' : squash(j.location.split(/[,/(]/)[0]);
    const key = `${squash(j.company)}|${squash(j.title)}|${city}`;
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, j);
      continue;
    }
    const [keep, drop] = j.p < seen.p ? [j, seen] : [seen, j];
    keep.alsoOn = [...new Set([...(keep.alsoOn || []), ...(drop.alsoOn || []), drop.via])].filter((v) => v !== keep.via);
    keep.salaryMin ??= drop.salaryMin;
    keep.salaryMax ??= drop.salaryMax;
    if (drop.firstSeen < keep.firstSeen) keep.firstSeen = drop.firstSeen;
    byKey.set(key, keep);
  }
  return [...byKey.values()];
}

async function main() {
  const now = new Date().toISOString();
  const prefs = loadPrefs(await readJson(`${CONFIG_DIR}/preferences.json`));
  const sources = await readJson(`${CONFIG_DIR}/sources.json`);
  let prev = await readJson(OUT, { jobs: [], origins: [] });
  if (prev.sample && !SAMPLE) prev = { jobs: [], origins: [] };
  const firstRun = !prev.jobs.length;

  const prevByOrigin = new Map();
  for (const j of prev.jobs) {
    if (!prevByOrigin.has(j.origin)) prevByOrigin.set(j.origin, []);
    prevByOrigin.get(j.origin).push(j);
  }
  const prevStatus = new Map((prev.origins || []).map((o) => [o.origin, o]));
  const prevSeen = new Map(prev.jobs.map((j) => [j.id, j.firstSeen]));

  const units = buildUnits(sources, prefs, process.env);
  const results = await pool(units, 4, async (u) => {
    const base = { origin: u.origin, label: u.label, via: u.via, kind: u.kind };
    const old = prevByOrigin.get(u.origin) || [];
    const last = prevStatus.get(u.origin);
    if (u.off) return { ...base, status: 'off', note: u.off, jobs: [] };

    const hoursSince = last?.fetchedAt ? (Date.now() - new Date(last.fetchedAt).getTime()) / 3600000 : Infinity;
    if (u.minHours && hoursSince < u.minHours && last?.status !== 'error') {
      return { ...base, status: 'ok', fetchedAt: last.fetchedAt, note: 'Resting between checks.', jobs: old };
    }
    try {
      const raw = await u.run();
      let jobs = raw.map((r) => finalize(r, u, now, prefs)).filter(Boolean);
      if (u.postFilter) jobs = jobs.filter((j) => j.skills.length || u.postFilter.some((k) => keywordMatch(j.title, k)));
      console.log(`ok     ${u.origin}  ${jobs.length} postings`);
      return { ...base, status: 'ok', fetchedAt: now, found: jobs.length, jobs };
    } catch (e) {
      console.log(`FAILED ${u.origin}  ${e.message}`);
      return {
        ...base,
        status: 'error',
        fetchedAt: last?.fetchedAt || null,
        note: `${e.message} Showing ${old.length} postings from the last good check.`,
        jobs: old,
      };
    }
  });

  results.forEach((r, i) => r.jobs.forEach((j) => (j.p = units[i].priority)));

  const tried = results.filter((r) => r.status !== 'off');
  if (tried.length && tried.every((r) => r.status === 'error')) {
    console.error('Every source failed. Keeping the existing jobs.json untouched.');
    process.exit(1);
  }

  let jobs = results.flatMap((r) => r.jobs);
  // Config-level screen: title must match (when titles are set) and must not be excluded.
  jobs = jobs.filter(
    (j) =>
      (!prefs.titleKeywords.length || j.skills?.length || prefs.titleKeywords.some((k) => keywordMatch(j.title, k))) &&
      !prefs.excludeKeywords.some((k) => keywordMatch(j.title, k)),
  );
  for (const j of jobs) {
    // Keep the day we first saw each posting. On the very first run, trust the posted date.
    j.firstSeen = prevSeen.get(j.id) || (firstRun && j.postedAt ? j.postedAt : j.firstSeen);
  }
  jobs = dedupe(jobs);
  jobs.sort((a, b) => (jobDate(b) || '').localeCompare(jobDate(a) || ''));

  const kept = new Map();
  for (const j of jobs) kept.set(j.origin, (kept.get(j.origin) || 0) + 1);
  const origins = results.map(({ jobs: _drop, ...r }) => ({ ...r, kept: kept.get(r.origin) || 0 }));

  const out = { generatedAt: now, sample: SAMPLE, defaults: prefs, origins, jobs: jobs.map(({ p, ...j }) => j) };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out));
  const bad = origins.filter((o) => o.status === 'error').length;
  console.log(`\n${jobs.length} postings saved from ${origins.length} sources${bad ? ` (${bad} had problems)` : ''}.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
