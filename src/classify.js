// CLASSIFY — tag each artifact with a target document + doc-type, using filename/path/heading heuristics.
import fs from 'node:fs';

// Doc-type heuristics drive intra-document ordering (overview first, troubleshooting last).
const TYPE_RULES = [
  { type: 'overview', re: /readme|overview|introduction|index|master/i },
  { type: 'how-to', re: /quickstart|getting.?started|guide|tutorial|how.?to|onboard|setup|install|flash/i },
  { type: 'reference', re: /api|schema|protocol|reference|endpoint|spec|database|websocket|graphql/i },
  { type: 'ops', re: /deploy|monitor|security|backup|runbook|scaling|performance/i },
  { type: 'troubleshoot', re: /troubleshoot|faq|debug|known.?issue|gotcha/i },
  { type: 'concept', re: /design|architecture|model|theory|why|decision/i }
];

function docType(name, rel) {
  const hay = `${rel} ${name}`;
  for (const r of TYPE_RULES) if (r.re.test(hay)) return r.type;
  return 'other';
}

function readHead(file, n = 4000) {
  try { return fs.readFileSync(file, 'utf8').slice(0, n); } catch { return ''; }
}

function extractTitle(md, fallback) {
  const m = md.match(/^\s*#\s+(.+)$/m);
  if (m) return m[1].replace(/[#*`]/g, '').trim();
  return fallback;
}

function extractSummary(md) {
  // First non-heading, non-empty prose line.
  const lines = md.split('\n');
  for (const ln of lines) {
    const t = ln.trim();
    if (!t || t.startsWith('#') || t.startsWith('!') || t.startsWith('|') || t.startsWith('```') || t.startsWith('-')) continue;
    return t.replace(/[*`]/g, '').slice(0, 180);
  }
  return '';
}

function chooseDocument(art, cfg, md) {
  const hay = `${art.rel} ${art.name} ${md.slice(0, 600)}`.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const doc of cfg.documents) {
    let score = 0;
    for (const pat of doc.match) {
      const re = new RegExp(pat, 'i');
      if (re.test(art.name)) score += 3;       // filename match is strongest
      else if (re.test(art.rel)) score += 2;   // path match
      else if (re.test(hay)) score += 1;        // content match
    }
    if (score > bestScore) { bestScore = score; best = doc.id; }
  }
  return { document: best || cfg.fallbackDocument, score: bestScore };
}

export function classify(manifest, cfg) {
  for (const art of manifest) {
    if (art.kind !== 'markdown') continue;
    const md = readHead(art.path, 8000);
    const fallbackTitle = art.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    art.title = extractTitle(md, fallbackTitle);
    art.summary = extractSummary(md);
    art.docType = docType(art.name, art.rel);
    const { document, score } = chooseDocument(art, cfg, md);
    art.document = document;
    art.matchScore = score;
    art.headings = (md.match(/^#{1,3}\s+.+$/gm) || []).length;
  }
  return manifest;
}
