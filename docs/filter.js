// Shared matching rules. Used by the app (in the browser), the fetcher and the
// daily email, so all three always agree on what counts as a match.

export const LEVELS = [
  ['intern', 'Intern'],
  ['entry', 'Entry'],
  ['mid', 'Mid'],
  ['senior', 'Senior'],
  ['director', 'Director+'],
];

export const DEFAULT_FILTERS = {
  query: '',
  titleKeywords: [],
  excludeKeywords: [],
  locations: [],
  remote: 'include', // include | only | exclude
  minSalary: 0,
  requireSalary: false,
  maxAgeDays: 30, // 0 = any age
  levels: [],
  fullTimeOnly: false,
  hideRestricted: false,
  targetOnly: false,
  newOnly: false,
};

export function splitList(v) {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(/[,\n]/);
  return arr.map((s) => String(s).trim()).filter(Boolean);
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "data analyst" matches "Senior Analyst, Data" and "Data Analytics Analyst":
// every word must start a word in the text. Short words (3 letters or fewer,
// like "RN" or "UX") must match a whole word.
export function keywordMatch(text, keyword) {
  const t = String(text ?? '').toLowerCase();
  const words = String(keyword ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  return words.every((w) => {
    const tail = w.length <= 3 ? '(?![a-z0-9])' : '';
    return new RegExp(`(^|[^a-z0-9])${esc(w)}${tail}`).test(t);
  });
}

// Exact phrase, whole words: "IBM i" matches "IBM i developer" but not "IBM ... I".
export function phraseMatch(text, phrase) {
  const words = String(phrase ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  return new RegExp(`(^|[^a-z0-9])${words.map(esc).join('\\s+')}(?![a-z0-9])`).test(String(text ?? '').toLowerCase());
}

const NOT_FULL_TIME = /\b(part[- ]?time|contract(or)?|c2h|c2c|corp[- ]to[- ]corp|temp(orary)?|intern(ship)?|freelance|seasonal|per[- ]diem)\b/i;
export function isFullTime(job) {
  return !NOT_FULL_TIME.test(`${job.type || ''} ${job.title || ''}`.replace(/_/g, ' '));
}

export function levelOf(title) {
  const t = ` ${String(title ?? '').toLowerCase()} `;
  if (/\b(intern|internship|co-?op|apprentice(ship)?)\b/.test(t)) return 'intern';
  if (/\b(director|head of|vp|vice president|chief|svp|evp)\b/.test(t)) return 'director';
  if (/\b(senior|sr|staff|principal|lead|iii|iv)\b/.test(t)) return 'senior';
  if (/\b(junior|jr|entry|associate|new grad|graduate|early career)\b/.test(t) || /\b(i|1)\s*$/.test(t.trim())) return 'entry';
  return 'mid';
}

export function jobDate(job) {
  return job.postedAt || job.firstSeen || null;
}

export function ageDays(job, now = Date.now()) {
  const d = jobDate(job);
  if (!d) return 0;
  return Math.max(0, (now - new Date(d).getTime()) / 86400000);
}

export function prefsToFilters(prefs = {}) {
  return {
    ...DEFAULT_FILTERS,
    titleKeywords: splitList(prefs.titleKeywords),
    excludeKeywords: splitList(prefs.excludeKeywords),
    locations: splitList(prefs.locations),
    remote: prefs.remoteOnly ? 'only' : prefs.includeRemote === false ? 'exclude' : 'include',
    minSalary: Number(prefs.minSalary) || 0,
    requireSalary: !!prefs.requireSalary,
    maxAgeDays: prefs.maxAgeDays == null ? 30 : Number(prefs.maxAgeDays) || 0,
    levels: splitList(prefs.levels),
    fullTimeOnly: !!prefs.fullTimeOnly,
    hideRestricted: !!prefs.hideRestricted,
  };
}

export function matches(job, f, now = Date.now()) {
  const title = job.title || '';

  // A posting passes on its title, or because its description names one of the key skills.
  if (f.titleKeywords?.length && !job.skills?.length && !f.titleKeywords.some((k) => keywordMatch(title, k))) return false;
  if (f.excludeKeywords?.length && f.excludeKeywords.some((k) => keywordMatch(title, k))) return false;

  if (f.query) {
    const hay = `${title} ${job.company || ''} ${job.location || ''}`.toLowerCase();
    if (!f.query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }

  const remote = !!job.remote;
  if (f.remote === 'only' && !remote) return false;
  if (f.remote === 'exclude' && remote) return false;
  if (f.locations?.length) {
    const loc = (job.location || '').toLowerCase();
    const inPlace = f.locations.some((l) => loc.includes(l.toLowerCase()));
    const remoteOk = remote && f.remote !== 'exclude';
    if (!inPlace && !remoteOk) return false;
  }

  if (f.minSalary > 0) {
    const top = job.salaryMax || job.salaryMin || 0;
    if (top) {
      if (top < f.minSalary) return false;
    } else if (f.requireSalary) return false;
  } else if (f.requireSalary && !(job.salaryMax || job.salaryMin)) return false;

  if (f.maxAgeDays > 0 && ageDays(job, now) > f.maxAgeDays) return false;
  if (f.fullTimeOnly && !isFullTime(job)) return false;
  if (f.hideRestricted && job.restricted) return false;
  if (f.targetOnly && !job.target) return false;
  if (f.levels?.length && !f.levels.includes(job.level || levelOf(title))) return false;

  return true;
}
