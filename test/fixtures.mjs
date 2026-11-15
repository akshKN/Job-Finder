// Stand-in responses shaped like each real API, with made-up employers.
// Used by the tests and to build the sample feed the app ships with.
const day = 86400000;
const ago = (d) => new Date(Date.now() - d * day).toISOString();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const greenhouse = {
  jobs: [
    { id: 4101, title: 'Senior Data Analyst', updated_at: ago(0.3), first_published: ago(0.3), location: { name: 'Dallas, TX' }, absolute_url: 'https://example.com/larkspur/4101', content: esc('<p>Own reporting for our clinic network.</p><p>Pay range: $118,000 - $142,000 a year.</p>') },
    { id: 4102, title: 'Product Manager, Patient Apps', updated_at: ago(2), first_published: ago(2), location: { name: 'Remote - US' }, absolute_url: 'https://example.com/larkspur/4102', content: esc('<p>Lead the roadmap for our patient apps &amp; portal.</p>') },
    { id: 4103, title: 'Registered Nurse, Care Coordination', updated_at: ago(5), first_published: ago(5), location: { name: 'Plano, TX' }, absolute_url: 'https://example.com/larkspur/4103', content: esc('<p>Coordinate care plans across three clinics.</p>') },
    { id: 4104, title: 'People Operations Intern', updated_at: ago(41), first_published: ago(41), location: { name: 'Austin, TX' }, absolute_url: 'https://example.com/larkspur/4104', content: esc('<p>Summer internship with the people team.</p>') },
  ],
};

const lever = [
  { id: 'bb-1', text: 'Marketing Manager', categories: { location: 'Austin, TX', commitment: 'Full-time' }, workplaceType: 'hybrid', createdAt: Date.now() - 1 * day, hostedUrl: 'https://example.com/bluebonnet/bb-1', descriptionPlain: 'Run lifecycle campaigns for a growing consumer brand.', salaryRange: { min: 95000, max: 120000, currency: 'USD', interval: 'per-year-salary' } },
  { id: 'bb-2', text: 'Junior UX Designer', categories: { location: 'Remote', commitment: 'Full-time' }, workplaceType: 'remote', createdAt: Date.now() - 0.1 * day, hostedUrl: 'https://example.com/bluebonnet/bb-2', descriptionPlain: 'Design flows for our mobile checkout.' },
  { id: 'bb-3', text: 'Staff Accountant', categories: { location: 'Houston, TX', commitment: 'Full-time' }, workplaceType: 'on-site', createdAt: Date.now() - 9 * day, hostedUrl: 'https://example.com/bluebonnet/bb-3', descriptionPlain: 'Month-end close and reconciliations. $68k to $80k.' },
];

const ashby = {
  jobs: [
    { id: 'ps-1', title: 'Software Engineer, Platform', location: 'Dallas, TX', isRemote: false, workplaceType: 'Hybrid', publishedAt: ago(0.6), jobUrl: 'https://example.com/pecanstreet/ps-1', employmentType: 'FullTime', descriptionPlain: 'Build the pipelines behind our energy analytics.', isListed: true, compensation: { summaryComponents: [{ compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'USD', minValue: 135000, maxValue: 170000 }] } },
    { id: 'ps-2', title: 'Customer Success Manager', location: 'Remote', isRemote: true, publishedAt: ago(3), jobUrl: 'https://example.com/pecanstreet/ps-2', employmentType: 'FullTime', descriptionPlain: 'Own renewals for our utility customers.', isListed: true },
    { id: 'ps-3', title: 'Unlisted Secret Role', location: 'Dallas, TX', publishedAt: ago(1), jobUrl: 'https://example.com/pecanstreet/ps-3', isListed: false },
  ],
};

const smartrecruiters = {
  totalFound: 2,
  content: [
    { id: 'tr-77', name: 'Project Coordinator', releasedDate: ago(1.5), location: { city: 'Fort Worth', region: 'TX', country: 'us', remote: false }, company: { name: 'Trinity River Bank' }, typeOfEmployment: { label: 'Full-time' } },
    { id: 'tr-78', name: 'Director of Human Resources', releasedDate: ago(12), location: { city: 'Dallas', region: 'TX', country: 'us', remote: false }, company: { name: 'Trinity River Bank' }, typeOfEmployment: { label: 'Full-time' } },
  ],
};

const adzuna = {
  results: [
    // Same job as Larkspur 4101 above: should merge into the direct posting.
    { id: 'az-1', title: 'Senior Data Analyst', company: { display_name: 'Larkspur Health Inc.' }, location: { display_name: 'Dallas, Dallas County' }, created: ago(0.2), redirect_url: 'https://example.com/adzuna/az-1', description: 'Own reporting for our clinic network.', salary_is_predicted: '1', salary_min: 99000, salary_max: 99000 },
    { id: 'az-2', title: 'Financial Analyst', company: { display_name: 'Harbor & Vine' }, location: { display_name: 'Irving, Dallas County' }, created: ago(4), redirect_url: 'https://example.com/adzuna/az-2', description: 'Forecasting for a regional grocer.', salary_is_predicted: '0', salary_min: 82000, salary_max: 96000 },
    { id: 'az-4', title: 'IBM i (AS/400) Developer', company: { display_name: 'Harbor & Vine' }, location: { display_name: 'Remote, US' }, created: ago(0.4), redirect_url: 'https://example.com/adzuna/az-4', contract_time: 'full_time', salary_is_predicted: '0', salary_min: 95000, salary_max: 115000, description: 'Maintain and extend our order management system on IBM i. You will write RPGLE and SQLRPGLE, CL, and DB2 SQL, build REST APIs with JSON for our WMS and EDI partners, and support month-end batch jobs. Experience with subfiles, service programs, Git and Jira is a plus. Agile team, on-call rotation.' },
    { id: 'az-5', title: 'Programmer Analyst - 6 month contract', company: { display_name: 'Cedar Loop' }, location: { display_name: 'Plano, Collin County' }, created: ago(1.2), redirect_url: 'https://example.com/adzuna/az-5', contract_time: 'contract', description: 'RPGLE programmer analyst for a warehouse system rewrite.' },
    { id: 'az-6', title: 'Systems Developer', company: { display_name: 'Lone Star Defense Supply' }, location: { display_name: 'Fort Worth, Tarrant County' }, created: ago(2.2), redirect_url: 'https://example.com/adzuna/az-6', description: 'AS400 developer supporting logistics. Must be a U.S. citizen with an active security clearance.' },
    { id: 'az-3', title: 'Warehouse Associate', company: { display_name: 'Harbor & Vine' }, location: { display_name: 'Irving, Dallas County' }, created: ago(1), redirect_url: 'https://example.com/adzuna/az-3', description: 'Fuzzy match that mentions an analyst once.' },
  ],
};

const remotive = {
  jobs: [
    { id: 9001, url: 'https://example.com/remotive/9001', title: 'Operations Analyst', company_name: 'Cedar Loop', job_type: 'full_time', publication_date: ago(2.5), candidate_required_location: 'USA', salary: '$70k - $85k', description: '<p>Support a fully remote operations team.</p>' },
    { id: 9002, url: 'https://example.com/remotive/9002', title: 'Rust Developer', company_name: 'Cedar Loop', job_type: 'contract', publication_date: ago(6), candidate_required_location: 'Worldwide', salary: '', description: '<p>Contract role.</p>' },
  ],
};

const usajobs = {
  SearchResult: {
    SearchResultItems: [
      { MatchedObjectId: 'u1', MatchedObjectDescriptor: { PositionID: 'VA-123', PositionTitle: 'Program Analyst', PositionURI: 'https://example.com/usajobs/VA-123', PositionLocationDisplay: 'Dallas, Texas', OrganizationName: 'Veterans Health Administration', PositionRemuneration: [{ MinimumRange: '88520', MaximumRange: '115079', RateIntervalCode: 'PA' }], PublicationStartDate: ago(3), UserArea: { Details: { JobSummary: 'Analyze program performance.' } } } },
    ],
  },
};

const jooble = {
  totalCount: 2,
  jobs: [
    { id: 7001, title: '<b>AS/400</b> RPG Developer', location: 'Dallas, TX', snippet: 'Full-time <b>RPGLE</b> developer for our freight billing system on IBM i.', salary: '$90,000 - $110,000', source: 'example.com', type: 'Full-time', link: 'https://example.com/jooble/7001', company: 'Mesa Verde Freight', updated: ago(0.8) },
    { id: 7002, title: 'Forklift Operator', location: 'Dallas, TX', snippet: 'Warehouse role.', salary: '', source: 'example.com', type: 'Full-time', link: 'https://example.com/jooble/7002', company: 'Mesa Verde Freight', updated: ago(1) },
  ],
};

export function respond(url, body) {
  const fail = process.env.FIXTURE_FAIL;
  if (fail && fail.split(',').some((f) => url.includes(f))) throw new Error('HTTP 503');
  if (url.includes('boards-api.greenhouse.io/v1/boards/larkspur/')) return greenhouse;
  if (url.includes('api.lever.co/v0/postings/bluebonnet')) return lever;
  if (url.includes('api.ashbyhq.com/posting-api/job-board/pecanstreet')) return ashby;
  if (url.includes('api.smartrecruiters.com/v1/companies/TrinityRiver/')) return smartrecruiters;
  if (url.includes('jooble.org/api/')) {
    if (!body?.keywords || !body?.location) throw new Error('Jooble needs keywords and location');
    return jooble;
  }
  if (url.includes('api.adzuna.com/')) return adzuna;
  if (url.includes('remotive.com/api/')) return remotive;
  if (url.includes('data.usajobs.gov/')) return usajobs;
  throw Object.assign(new Error('Not found (404). Check the company token.'), { fatal: true });
}
