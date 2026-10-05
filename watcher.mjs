// Opportunity watcher: Johnson & Johnson careers (Workday public feed).
// Flags NEW roles in France, or fully remote roles open to EU countries,
// in communications, marketing, medical affairs, or patient-facing work.
// New matches go to NOTIFY.txt, which makes the GitHub Action fail and email you.
import fs from "node:fs";

const BASE = "https://jj.wd5.myworkdayjobs.com";
const API = `${BASE}/wday/cxs/jj/JJ`;
const SEEN_FILE = "seen-jnj.json";
const MATCHES_FILE = "JNJ_MATCHES.md";

const FAMILIES = [
  "Communications & Corporate/External Affairs",
  "Digital Marketing",
  "Marketing",
  "Medical Affairs Group",
  "Project/Program Management Group",
];
const KEYWORDS = [
  "patient", "advocacy", "engagement", "community", "content",
  "social media", "storytelling", "communications", "public affairs", "medical education",
];
const FRANCE = /France|Paris|Issy|Rungis|Val-de-Reuil/i;
const EU = /France|Belgium|Netherlands|Germany|Spain|Italy|Ireland|Portugal|Poland|Czech|Denmark|Sweden|Finland|Austria|Greece|Hungary|Romania|Slovakia|Europe|EMEA/i;
const EXCLUDE = /sales (specialist|representative)|territory manager|d[ée]l[ée]gu[ée]|medical science liaison|\bMSL\b|engineer|technician|technieker|\bQC\b|operator|intern\b|internship|stage\b|alternance|apprenti|customer service|field service|account manager|pricing/i;
const WANT = /communicat|public affairs|patient|advoca|engagement|community|content|social|storytell|digital|marketing|brand|education|medical writ|medical affairs|insight|experience|program manager|project manager/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(body) {
  const r = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Workday search ${r.status}`);
  return r.json();
}
async function detail(path) {
  const r = await fetch(`${API}${path}`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Workday detail ${r.status}`);
  return (await r.json()).jobPostingInfo;
}
async function collect(appliedFacets, searchText) {
  const out = [];
  for (let offset = 0; offset < 400; offset += 20) {
    const d = await post({ appliedFacets, limit: 20, offset, searchText });
    const jobs = d.jobPostings || [];
    out.push(...jobs);
    if (jobs.length < 20) break;
    await sleep(300);
  }
  return out;
}

const seen = fs.existsSync(SEEN_FILE) ? JSON.parse(fs.readFileSync(SEEN_FILE, "utf8")) : {};
const firstRun = Object.keys(seen).length === 0;

// 1. Gather candidate postings by job family and by keyword.
const facetData = await post({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" });
const famFacet = facetData.facets.find((f) => f.facetParameter === "jobFamilyGroup");
const pool = new Map();
for (const name of FAMILIES) {
  const v = famFacet?.values.find((x) => x.descriptor === name);
  if (!v) { console.log(`family not found: ${name}`); continue; }
  for (const j of await collect({ jobFamilyGroup: [v.id] }, "")) pool.set(j.externalPath, j);
}
for (const k of KEYWORDS) for (const j of await collect({}, k)) pool.set(j.externalPath, j);
console.log(`pool: ${pool.size} postings`);

// 2. Check locations on postings we have not judged before.
const fresh = [];
for (const [path, j] of pool) {
  if (seen[path]) continue;
  if (EXCLUDE.test(j.title) || !WANT.test(j.title)) { seen[path] = { skip: true }; continue; }
  if (!/Locations/.test(j.locationsText) && !EU.test(j.locationsText)) { seen[path] = { skip: true }; continue; }
  let info;
  try { info = await detail(path); } catch (e) { console.log(e.message); continue; }
  await sleep(200);
  const locs = [info.location, ...(info.additionalLocations || [])].join("; ");
  const remote = info.remoteType || "";
  const ok = FRANCE.test(locs) || (/Fully Remote/i.test(remote) && EU.test(locs));
  const rec = { title: info.title, locs, remote, posted: info.postedOn, url: `${BASE}/en-US/JJ${path}`, match: ok, firstSeen: new Date().toISOString().slice(0, 10) };
  seen[path] = rec;
  if (ok) fresh.push(rec);
}

// 3. Save state, write a readable list of all current matches, notify on new ones.
fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 1));
const live = new Set(pool.keys());
const current = Object.entries(seen).filter(([p, r]) => r.match && live.has(p)).map(([, r]) => r);
fs.writeFileSync(MATCHES_FILE,
  `# J&J roles matching your filters\n\nUpdated ${new Date().toISOString()}\n\n` +
  (current.length ? current.map((r) => `- [${r.title}](${r.url}) | ${r.locs} | ${r.remote}`).join("\n") : "None right now.") + "\n");

if (firstRun) {
  console.log(`first run: recorded ${fresh.length} existing matches without alerting`);
} else if (fresh.length) {
  const msg = fresh.map((r) => `${r.title} | ${r.locs} | ${r.remote} | ${r.url}`).join(" ;; ");
  fs.writeFileSync("NOTIFY.txt", `New J&J role(s): ${msg}`);
  console.log(`NEW: ${msg}`);
} else {
  console.log("no new J&J matches");
}
