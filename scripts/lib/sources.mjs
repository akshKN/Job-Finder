// One adapter per job source. Each returns plain objects:
// { sid, title, company, location, remote, workplace, salaryMin, salaryMax,
//   postedAt, url, type, text }
import { getJson, htmlToText, isRemoteText, toISO } from './util.mjs';

const q = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

const workplaceOf = (s) => {
  const t = String(s ?? '').toLowerCase();
  if (t.includes('remote')) return 'remote';
  if (t.includes('hybrid')) return 'hybrid';
  if (t.includes('site') || t.includes('office')) return 'onsite';
  return null;
};

// ---------- Employer career pages (public, no key) ----------

async function greenhouse(c) {
  const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.token)}/jobs?content=true`);
  return (data.jobs || []).map((j) => ({
    sid: j.id,
    title: j.title,
    company: c.name || j.company_name,
    location: j.location?.name || '',
    postedAt: toISO(j.first_published || j.updated_at),
    url: j.absolute_url,
    text: htmlToText(j.content),
  }));
}

async function lever(c) {
  const data = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(c.token)}?mode=json`);
  return (Array.isArray(data) ? data : []).map((j) => {
    const yearly = /year/i.test(j.salaryRange?.interval || '');
    return {
      sid: j.id,
      title: j.text,
      company: c.name,
      location: j.categories?.location || (j.categories?.allLocations || []).join(' / ') || '',
      workplace: workplaceOf(j.workplaceType),
      salaryMin: yearly ? j.salaryRange.min : null,
      salaryMax: yearly ? j.salaryRange.max : null,
      postedAt: toISO(j.createdAt),
      url: j.hostedUrl || j.applyUrl,
      type: j.categories?.commitment || null,
      text: j.descriptionPlain || htmlToText(j.description),
    };
  });
}

async function ashby(c) {
  const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.token)}?includeCompensation=true`);
  return (data.jobs || [])
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const pay = (j.compensation?.summaryComponents || []).find(
        (p) => /salary/i.test(p.compensationType || '') && /year/i.test(p.interval || ''),
      );
      return {
        sid: j.id || j.jobUrl,
        title: j.title,
        company: c.name,
        location: j.location || '',
        remote: j.isRemote === true ? true : undefined,
        workplace: workplaceOf(j.workplaceType),
        salaryMin: pay?.minValue ?? null,
        salaryMax: pay?.maxValue ?? null,
        postedAt: toISO(j.publishedAt),
        url: j.jobUrl || j.applyUrl,
        type: j.employmentType || null,
        text: j.descriptionPlain || htmlToText(j.descriptionHtml),
      };
    });
}

async function smartrecruiters(c) {
  const out = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const data = await getJson(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(c.token)}/postings?limit=100&offset=${offset}`,
    );
    const items = data.content || [];
    for (const j of items) {
      const loc = j.location || {};
      out.push({
        sid: j.id,
        title: j.name,
        company: c.name || j.company?.name,
        location: loc.fullLocation || [loc.city, loc.region, (loc.country || '').toUpperCase()].filter(Boolean).join(', '),
        remote: loc.remote === true ? true : undefined,
        postedAt: toISO(j.releasedDate),
        url: `https://jobs.smartrecruiters.com/${encodeURIComponent(c.token)}/${encodeURIComponent(j.id)}`,
        type: j.typeOfEmployment?.label || null,
        text: '',
      });
    }
    if (items.length < 100) break;
  }
  return out;
}

export const ATS = { greenhouse, lever, ashby, smartrecruiters };
export const ATS_LABEL = { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', smartrecruiters: 'SmartRecruiters' };

// ---------- Aggregators (searched by keyword) ----------

async function adzuna({ keywords, prefs, cfg, env }) {
  const country = (prefs.country || 'us').toLowerCase();
  const places = (prefs.locations || []).slice(0, 3);
  const searches = [];
  for (const k of keywords) {
    if (cfg.nationwide) {
      searches.push({ what: k }); // rare skills: search the whole country, filter by place in the app
      continue;
    }
    for (const where of places) searches.push({ what: k, where });
    if (!places.length) searches.push({ what: k });
    else if (prefs.includeRemote !== false) searches.push({ what: `${k} remote` });
  }
  const out = [];
  for (const s of searches) {
    for (let page = 1; page <= (cfg.pages || 1); page++) {
      const data = await getJson(
        `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?` +
          q({
            app_id: env.ADZUNA_APP_ID,
            app_key: env.ADZUNA_APP_KEY,
            results_per_page: 50,
            what: s.what,
            where: s.where,
            max_days_old: prefs.maxAgeDays || 30,
            sort_by: 'date',
          }),
      );
      const items = data.results || [];
      for (const j of items) {
        const predicted = String(j.salary_is_predicted) === '1';
        out.push({
          sid: j.id,
          title: htmlToText(j.title),
          company: j.company?.display_name || 'Unknown company',
          location: j.location?.display_name || '',
          salaryMin: predicted ? null : j.salary_min || null,
          salaryMax: predicted ? null : j.salary_max || null,
          postedAt: toISO(j.created),
          url: j.redirect_url,
          type: j.contract_time || null,
          text: htmlToText(j.description),
        });
      }
      if (items.length < 50) break;
    }
  }
  return out;
}

// Jooble: free key (100 requests a day). Searches many job boards and employer
// sites at once. Returns short excerpts, and each link opens the posting via Jooble.
async function jooble({ keywords, prefs, cfg, env }) {
  const searches = cfg.searches?.length ? cfg.searches : [{ location: 'United States' }];
  const out = [];
  for (const k of keywords) {
    for (const s of searches) {
      for (let page = 1; page <= (cfg.pages || 1); page++) {
        const data = await getJson(`https://jooble.org/api/${encodeURIComponent(env.JOOBLE_API_KEY)}`, {
          body: { keywords: k, location: s.location, ...(s.radius ? { radius: String(s.radius) } : {}), page, ResultOnPage: 50 },
        });
        const items = data.jobs || [];
        for (const j of items) {
          const text = htmlToText(j.snippet);
          out.push({
            sid: j.id,
            title: htmlToText(j.title),
            company: j.company || 'Company not listed',
            location: j.location || '',
            remote: isRemoteText(`${j.location} ${j.title} ${text}`) ? true : undefined,
            salaryText: j.salary || '',
            postedAt: toISO(j.updated),
            url: j.link,
            type: j.type || null,
            text,
          });
        }
        if (items.length < 50 || out.length >= (data.totalCount || 0)) break;
      }
    }
  }
  return out;
}

async function usajobs({ keywords, prefs, env }) {
  const places = (prefs.locations || []).slice(0, 3);
  const headers = { 'User-Agent': env.USAJOBS_EMAIL, 'Authorization-Key': env.USAJOBS_API_KEY };
  const out = [];
  for (const k of keywords) {
    const searches = places.map((p) => ({ LocationName: p }));
    if (!places.length) searches.push({});
    else if (prefs.includeRemote !== false) searches.push({ RemoteIndicator: 'True' });
    for (const extra of searches) {
      const data = await getJson(
        'https://data.usajobs.gov/api/search?' +
          q({ Keyword: k, ResultsPerPage: 250, DatePosted: Math.min(prefs.maxAgeDays || 30, 60), ...extra }),
        { headers },
      );
      for (const item of data.SearchResult?.SearchResultItems || []) {
        const d = item.MatchedObjectDescriptor || {};
        const pay = (d.PositionRemuneration || []).find((p) => /^(PA|Per Year)$/i.test(p.RateIntervalCode || p.Description || ''));
        out.push({
          sid: d.PositionID || item.MatchedObjectId,
          title: d.PositionTitle,
          company: d.OrganizationName || d.DepartmentName || 'US Government',
          location: d.PositionLocationDisplay || '',
          remote: d.UserArea?.Details?.RemoteIndicator === true ? true : undefined,
          salaryMin: pay ? Number(pay.MinimumRange) || null : null,
          salaryMax: pay ? Number(pay.MaximumRange) || null : null,
          postedAt: toISO(d.PublicationStartDate),
          url: d.PositionURI || (d.ApplyURI || [])[0],
          type: (d.PositionSchedule || [])[0]?.Name || null,
          text: d.UserArea?.Details?.JobSummary || d.QualificationSummary || '',
        });
      }
    }
  }
  return out;
}

// Remotive returns its whole (remote-only) board in one call. Its terms ask for
// a link back to the Remotive posting, credit as the source, and few requests.
async function remotive() {
  const data = await getJson('https://remotive.com/api/remote-jobs');
  return (data.jobs || []).map((j) => ({
    sid: j.id,
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location ? `Remote (${j.candidate_required_location})` : 'Remote',
    remote: true,
    salaryText: j.salary || '',
    postedAt: toISO(j.publication_date),
    url: j.url,
    type: j.job_type || null,
    text: htmlToText(j.description),
  }));
}

const AGGREGATORS = {
  jooble: { label: 'Jooble', run: jooble, needs: ['JOOBLE_API_KEY'], minHours: 8 },
  adzuna: { label: 'Adzuna', run: adzuna, needs: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'], minHours: 12 },
  usajobs: { label: 'USAJOBS', run: usajobs, needs: ['USAJOBS_API_KEY', 'USAJOBS_EMAIL'], minHours: 6 },
  remotive: { label: 'Remotive', run: remotive, needs: [], minHours: 8 },
};

// Turns the config into a list of things to fetch.
export function buildUnits(sources, prefs, env) {
  const units = [];
  for (const c of sources.companies || []) {
    if (c.enabled === false) continue;
    const fn = ATS[c.ats];
    units.push({
      origin: `${c.ats}:${c.token}`,
      label: c.name || c.token,
      via: ATS_LABEL[c.ats] || c.ats,
      kind: 'company',
      priority: 0,
      minHours: 0,
      off: fn ? null : `Unknown system "${c.ats}". Use greenhouse, lever, ashby or smartrecruiters.`,
      run: () => fn(c),
      postFilter: false,
    });
  }
  const keywords = (prefs.keywords?.length ? prefs.keywords : prefs.titleKeywords) || [];
  for (const [id, a] of Object.entries(AGGREGATORS)) {
    const cfg = sources.aggregators?.[id] || {};
    if (cfg.enabled !== true) continue; // each aggregator must be switched on in config/sources.json
    const missing = a.needs.filter((k) => !env[k]);
    let off = null;
    if (!keywords.length) off = 'Waiting for job titles in config/preferences.json.';
    else if (missing.length) off = `Not connected. Add the secret${missing.length > 1 ? 's' : ''} ${missing.join(' and ')}.`;
    units.push({
      origin: id,
      label: a.label,
      via: a.label,
      kind: 'aggregator',
      priority: id === 'usajobs' ? 1 : 2,
      minHours: cfg.minHours ?? a.minHours,
      off,
      run: () => a.run({ keywords, prefs, cfg, env }),
      // Aggregator search is fuzzy, so their results are re-checked against the keywords.
      postFilter: keywords,
    });
  }
  return units;
}

export { isRemoteText };
