// node test/run.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keywordMatch, phraseMatch, isFullTime, levelOf, matches, prefsToFilters, DEFAULT_FILTERS } from '../docs/filter.js';
import { htmlToText, parseSalary } from '../scripts/lib/util.mjs';
import { pickDigestJobs, renderDigest } from '../scripts/send-digest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`ok  ${name}`);
};

test('keyword matching', () => {
  assert.ok(keywordMatch('Senior Analyst, Data', 'data analyst'));
  assert.ok(keywordMatch('Software Engineering Manager', 'engineer'));
  assert.ok(keywordMatch('Registered Nurse (RN)', 'rn'));
  assert.ok(!keywordMatch('Intern, Research', 'rn'));
  assert.ok(!keywordMatch('Warehouse Associate', 'analyst'));
  assert.ok(keywordMatch('C++ Developer', 'c++'));
});

test('phrase matching and full-time check', () => {
  assert.ok(phraseMatch('Senior IBM i developer', 'IBM i'));
  assert.ok(!phraseMatch('IBM is where I work', 'IBM i'));
  assert.ok(phraseMatch('RPGLE/SQLRPGLE on AS/400.', 'AS/400'));
  assert.ok(!phraseMatch('Unreal RPGs', 'RPG IV'));
  assert.ok(isFullTime({ title: 'AS400 Developer', type: 'full_time' }));
  assert.ok(!isFullTime({ title: 'AS400 Developer', type: 'contract' }));
  assert.ok(!isFullTime({ title: 'AS400 Developer (C2H)' }));
});

test('level guess', () => {
  assert.equal(levelOf('People Operations Intern'), 'intern');
  assert.equal(levelOf('Associate Director, Finance'), 'director');
  assert.equal(levelOf('Sr. Data Analyst'), 'senior');
  assert.equal(levelOf('Analyst I'), 'entry');
  assert.equal(levelOf('Product Manager'), 'mid');
});

test('text and salary parsing', () => {
  assert.equal(htmlToText('&lt;p&gt;Apps &amp;amp; portal&lt;/p&gt;'), 'Apps & portal');
  assert.deepEqual(parseSalary('Pay range: $118,000 - $142,000 a year'), { min: 118000, max: 142000 });
  assert.deepEqual(parseSalary('$68k to $80k'), { min: 68000, max: 80000 });
  assert.equal(parseSalary('$25 - $35 per hour'), null);
});

test('filters', () => {
  const job = { title: 'Data Analyst', company: 'A', location: 'Austin, TX', remote: false, salaryMax: 90000, postedAt: new Date().toISOString() };
  const f = (o) => ({ ...DEFAULT_FILTERS, ...o });
  assert.ok(matches(job, f({})));
  assert.ok(!matches(job, f({ locations: ['Dallas'] })));
  assert.ok(matches({ ...job, remote: true }, f({ locations: ['Dallas'] })));
  assert.ok(!matches({ ...job, remote: true }, f({ locations: ['Dallas'], remote: 'exclude' })));
  assert.ok(!matches(job, f({ remote: 'only' })));
  assert.ok(!matches(job, f({ minSalary: 100000 })));
  assert.ok(matches({ ...job, salaryMax: null }, f({ minSalary: 100000 })), 'unlisted pay is kept unless pay is required');
  assert.ok(!matches({ ...job, salaryMax: null }, f({ minSalary: 100000, requireSalary: true })));
  assert.ok(!matches(job, f({ excludeKeywords: ['analyst'] })));
  assert.ok(!matches({ ...job, postedAt: new Date(Date.now() - 40 * 86400000).toISOString() }, f({})));
  assert.ok(matches({ ...job, postedAt: new Date(Date.now() - 40 * 86400000).toISOString() }, f({ maxAgeDays: 0 })));
  assert.ok(!matches(job, f({ query: 'dallas' })));
});

const out = join(mkdtempSync(join(tmpdir(), 'jobs-')), 'jobs.json');
const run = (extra = {}) =>
  execFileSync('node', [join(ROOT, 'scripts/fetch-jobs.mjs')], {
    env: {
      ...process.env,
      JOBS_FIXTURES: join(ROOT, 'test/fixtures.mjs'),
      JOBS_CONFIG_DIR: join(ROOT, 'test/config'),
      JOBS_OUT: out,
      JOOBLE_API_KEY: 'x',
      ADZUNA_APP_ID: 'x',
      ADZUNA_APP_KEY: 'x',
      USAJOBS_API_KEY: 'x',
      USAJOBS_EMAIL: 'x@example.com',
      FIXTURE_FAIL: '',
      ...extra,
    },
    encoding: 'utf8',
  });
const load = () => JSON.parse(readFileSync(out, 'utf8'));

test('fetch: every source parses, merges and screens', () => {
  run();
  const d = load();
  const titles = d.jobs.map((j) => j.title);
  assert.equal(d.origins.length, 8);
  assert.ok(d.origins.every((o) => o.status === 'ok'), JSON.stringify(d.origins));
  assert.ok(!titles.includes('Unlisted Secret Role'));
  assert.ok(!titles.includes('Warehouse Associate'), 'fuzzy aggregator hit is screened out');
  assert.ok(!titles.includes('Rust Developer'));
  assert.equal(titles.filter((t) => t === 'Senior Data Analyst').length, 1, 'duplicate merged');
  const merged = d.jobs.find((j) => j.title === 'Senior Data Analyst');
  assert.equal(merged.via, 'Greenhouse');
  assert.deepEqual(merged.alsoOn, ['Adzuna']);
  assert.equal(merged.salaryMin, 118000);
  assert.equal(d.jobs.find((j) => j.title === 'Marketing Manager').salaryMax, 120000);
  assert.equal(d.jobs.find((j) => j.title === 'Software Engineer, Platform').salaryMin, 135000);
  assert.equal(d.jobs.find((j) => j.title === 'Project Coordinator').url, 'https://jobs.smartrecruiters.com/TrinityRiver/tr-77');
  assert.equal(d.jobs.find((j) => j.title === 'Program Analyst').salaryMax, 115079);
  assert.ok(d.jobs.find((j) => j.title === 'Operations Analyst').remote);
  assert.equal(d.jobs.length, 18);
  const jb = d.jobs.find((j) => j.via === 'Jooble');
  assert.equal(jb.title, 'AS/400 RPG Developer');
  assert.equal(jb.salaryMin, 90000);
  assert.ok(!titles.includes('Forklift Operator'));
  const ibmi = d.jobs.find((j) => j.title === 'IBM i (AS/400) Developer');
  assert.deepEqual(ibmi.skills, ['AS/400', 'IBM i', 'RPGLE']);
  assert.ok(ibmi.target && !ibmi.restricted && ibmi.text.includes('subfiles'));
  const sys = d.jobs.find((j) => j.title === 'Systems Developer');
  assert.ok(sys.restricted && sys.skills.includes('AS400'), 'kept for the skill in its description, flagged as restricted');
  const f = (o) => ({ ...DEFAULT_FILTERS, maxAgeDays: 0, ...o });
  assert.ok(matches(sys, f({ titleKeywords: ['AS400'] })), 'description skill passes the title filter');
  assert.ok(!matches(sys, f({ hideRestricted: true })));
  assert.ok(!matches(d.jobs.find((j) => j.title.includes('6 month contract')), f({ fullTimeOnly: true })));
  assert.ok(matches(ibmi, f({ fullTimeOnly: true, hideRestricted: true, targetOnly: true, minSalary: 80000 })));
  assert.ok(!matches(d.jobs.find((j) => j.title === 'Marketing Manager'), f({ targetOnly: true })));
  for (let i = 1; i < d.jobs.length; i++) assert.ok((d.jobs[i - 1].postedAt || '') >= (d.jobs[i].postedAt || ''), 'newest first');
});

test('fetch: a failing source keeps its last postings and is flagged', () => {
  const before = load();
  run({ FIXTURE_FAIL: 'greenhouse' });
  const d = load();
  const gh = d.origins.find((o) => o.origin === 'greenhouse:larkspur');
  assert.equal(gh.status, 'error');
  assert.equal(d.jobs.length, before.jobs.length);
  const a = before.jobs.find((j) => j.id === 'lever:bluebonnet:bb-2');
  const b = d.jobs.find((j) => j.id === 'lever:bluebonnet:bb-2');
  assert.equal(a.firstSeen, b.firstSeen, 'first-seen date survives a refresh');
  const rest = d.origins.find((o) => o.origin === 'adzuna');
  assert.equal(rest.note, 'Resting between checks.');
  assert.equal(d.jobs.find((j) => j.title === 'Senior Data Analyst').via, 'Greenhouse');
});

test('fetch: stops without overwriting when everything fails', () => {
  const before = readFileSync(out, 'utf8');
  assert.throws(() => run({ FIXTURE_FAIL: 'greenhouse,lever,ashby,smartrecruiters,adzuna,remotive,usajobs,jooble' , JOBS_OUT: out + '.none' }));
  assert.equal(readFileSync(out, 'utf8'), before);
});

test('daily email picks only new matches', () => {
  const d = load();
  const jobs = pickDigestJobs(d, 25);
  assert.ok(jobs.length > 0 && jobs.length < d.jobs.length);
  assert.ok(jobs.every((j) => j.remote || /dallas/i.test(j.location)));
  const page = renderDigest(jobs, 'https://example.com/');
  assert.ok(page.includes('Senior Data Analyst') && !page.includes('<script'));
});

rmSync(dirname(out), { recursive: true, force: true });
console.log(`\n${passed} test groups passed.`);
