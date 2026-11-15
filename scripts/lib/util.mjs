import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const UA = 'job-finder/1.0 (personal job search)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fixtures;

// GET (or POST) JSON with a timeout and retries on 429/5xx/network errors.
export async function getJson(url, { headers = {}, body, tries = 3, timeoutMs = 25000 } = {}) {
  if (process.env.JOBS_FIXTURES) {
    fixtures ??= await import(pathToFileURL(resolve(process.env.JOBS_FIXTURES)).href);
    return fixtures.respond(url, body);
  }
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        body: body ? JSON.stringify(body) : undefined,
        headers: { 'User-Agent': UA, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 403) throw Object.assign(new Error('Access denied (403). Check the key.'), { fatal: true });
      if (res.status === 404) throw Object.assign(new Error('Not found (404). Check the company token.'), { fatal: true });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
      if (i < tries - 1) await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Greenhouse sends HTML that is itself entity-escaped, so decode, strip, decode.
export function htmlToText(html) {
  if (!html) return '';
  let s = decodeEntities(String(html));
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

// Finds an annual pay range such as "$120,000 - $150,000" or "$95k to $110k".
export function parseSalary(text) {
  if (!text) return null;
  const num = '(\\d{2,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d{2,3}(?:\\.\\d+)?\\s?k)';
  const m = String(text).match(new RegExp(`\\$\\s?${num}\\s*(?:-|–|—|to)\\s*\\$?\\s?${num}`, 'i'));
  if (!m) return null;
  const val = (x) => (/k$/i.test(x) ? parseFloat(x) * 1000 : parseFloat(x.replace(/,/g, '')));
  const a = val(m[1]);
  const b = val(m[2]);
  if (!(a >= 15000 && b >= a && b <= 2000000)) return null;
  return { min: Math.round(a), max: Math.round(b) };
}

export const isRemoteText = (s) => /\b(remote|work from home|anywhere|distributed)\b/i.test(String(s ?? ''));

export function toISO(v) {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const safeUrl = (u) => (/^https?:\/\//i.test(String(u ?? '')) ? String(u) : null);

// Run async jobs a few at a time.
export async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
