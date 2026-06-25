// REVIEW — score documentation coverage so reviewers see gaps at a glance: per-section status
// (complete / thin / stub), broken links, and features (entities/screens/repos) that lack prose.
import fs from 'node:fs';
import path from 'node:path';

const STUB_MAX = 60;   // words
const THIN_MAX = 220;  // words

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function bodyOf(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function wordCount(md) {
  return (md.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*`_|\-]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
}

// Find broken relative links in `md`. When `root` is given (linkScope: "root"), links that resolve
// outside that root — i.e. cross-repo `../other-repo/…` references — are skipped: they can't be
// validated from a single repo and are checked instead by the full-corpus build.
function brokenLinks(md, file, root) {
  const dir = path.dirname(file);
  const rootAbs = root ? path.resolve(root) : null;
  const out = [];
  for (const m of md.matchAll(/\]\(([^)\s]+)/g)) {
    let ref = m[1];
    if (/^(https?:|#|mailto:|tel:)/.test(ref)) continue;
    ref = ref.split('#')[0];
    if (!ref) continue;
    const resolved = path.resolve(dir, ref);
    if (rootAbs && !(resolved === rootAbs || resolved.startsWith(rootAbs + path.sep))) continue;
    if (!fs.existsSync(resolved)) out.push(ref);
  }
  return [...new Set(out)];
}

export function analyzeReview(book, gen, screens = [], opts = {}) {
  const scopeToRoot = opts.linkScope === 'root';
  const sections = [];
  const docStats = {};
  let corpus = '';

  for (const doc of book.documents) {
    docStats[doc.id] = { title: doc.title, complete: 0, thin: 0, stub: 0, total: 0 };
    for (const s of doc.sections) {
      const body = bodyOf(s.path);
      corpus += ' ' + (s.title || '') + ' ' + (s.summary || '') + ' ' + body.toLowerCase();
      const wc = wordCount(body);
      const status = wc < STUB_MAX ? 'stub' : wc < THIN_MAX ? 'thin' : 'complete';
      // The section's repo root = its absolute path with the repo-relative path removed.
      const root = scopeToRoot && s.rel && s.path.endsWith(s.rel)
        ? s.path.slice(0, s.path.length - s.rel.length) : null;
      const broken = brokenLinks(body, s.path, root);
      const rec = { docId: doc.id, docTitle: doc.title, title: s.title, repo: s.repo, rel: s.rel,
        anchor: slug(s.repo + '-' + s.title), wc, status, hasImg: (s.linkedImages || []).length > 0, broken };
      sections.push(rec);
      s._review = { status, wc }; // consumed by render() for inline badges
      docStats[doc.id][status]++;
      docStats[doc.id].total++;
    }
  }
  corpus = corpus.toLowerCase();

  // Features present in code/screens but absent from the prose.
  const mentions = (term) => corpus.includes(String(term).toLowerCase());
  const undocumentedEntities = (gen?.model?.entities || [])
    .filter(e => !mentions(e.name) && !mentions(e.table))
    .map(e => e.name);

  const documentedRepos = new Set(sections.map(s => s.repo));
  const reposWithoutDocs = (gen?.scan?.repos || [])
    .map(r => r.repo).filter(r => !documentedRepos.has(r));

  const GENERIC = /^(home|login|sign in|sign up|api root|console home|dashboard)$/i;
  const undocumentedScreens = screens
    .filter(s => !GENERIC.test(s.label || '') && !mentions((s.label || '').split('/')[0].trim()))
    .map(s => ({ name: s.name, label: s.label }));

  const thin = sections.filter(s => s.status !== 'complete');
  const broken = sections.filter(s => s.broken.length);

  const totals = { complete: 0, thin: 0, stub: 0, total: sections.length };
  for (const s of sections) totals[s.status]++;
  const coverage = totals.total ? Math.round((totals.complete / totals.total) * 100) : 0;

  // Headline: a section counts "ready" when complete; deductions for undocumented features.
  const gapCount = thin.length + undocumentedEntities.length + reposWithoutDocs.length +
    undocumentedScreens.length + broken.length;

  return {
    coverage, totals, docStats, sections, thin, broken,
    undocumentedEntities, reposWithoutDocs, undocumentedScreens, gapCount,
  };
}
