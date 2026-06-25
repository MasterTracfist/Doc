// ROUTE DISCOVERY — read a frontend repo's React Router definitions so capture can hit every page,
// instead of hand-listing routes. Skips auth/utility routes and ones needing dynamic params.
import fs from 'node:fs';
import path from 'node:path';

const SKIP_EXACT = new Set(['/', '/login', '/signup', '/forgot-password', '/reset-password',
  '/accept-invite', '/logout', '*', '/*']);

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(t|j)sx?$/.test(e.name)) out.push(full);
  }
}

function humanize(p) {
  return p.replace(/^\//, '').split('/').map(seg => seg.replace(/-/g, ' '))
    .join(' / ').replace(/^\w/, c => c.toUpperCase()) || 'Home';
}

// Strategy 1 — React Router / Vue Router: <Route path="x"> and { path: 'x' } in source.
function declaredRoutes(repoRoot) {
  const files = [];
  walk(path.join(repoRoot, 'src'), files);
  const raw = new Set();
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/<Route\s+[^>]*\bpath=["'`]([^"'`]+)["'`]/g)) raw.add(m[1]);
    for (const m of txt.matchAll(/\bpath:\s*["'`]([^"'`]+)["'`]/g)) raw.add(m[1]); // Vue/JS route tables
  }
  return [...raw];
}

// Strategy 2 — Next.js file-based routing: pages/** and app/**/page.* map files to URLs.
function nextRoutes(repoRoot) {
  const out = [];
  for (const base of ['pages', 'src/pages']) {
    const dir = path.join(repoRoot, base);
    if (!fs.existsSync(dir)) continue;
    const files = []; walk(dir, files);
    for (const f of files) {
      const rel = path.relative(dir, f);
      if (/(^|\/)(_app|_document|_error|api)\b/.test(rel)) continue;
      let p = '/' + rel.replace(/\.(t|j)sx?$/, '').replace(/\/index$/, '').replace(/^index$/, '');
      out.push(p === '/' ? '/' : p);
    }
  }
  for (const base of ['app', 'src/app']) {
    const dir = path.join(repoRoot, base);
    if (!fs.existsSync(dir)) continue;
    const files = []; walk(dir, files);
    for (const f of files) {
      if (!/\/page\.(t|j)sx?$/.test(f)) continue;
      let p = '/' + path.relative(dir, path.dirname(f)).replace(/\([^/]*\)\/?/g, ''); // strip route groups
      out.push(p.replace(/\/$/, '') || '/');
    }
  }
  return out;
}

export function discoverRoutes(repoRoot, opts = {}) {
  let raw = declaredRoutes(repoRoot);
  if (!raw.length) raw = nextRoutes(repoRoot); // fall back to file-based routing
  const routes = [];
  const seen = new Set();
  for (let p of raw) {
    if (!p.startsWith('/')) p = '/' + p;          // relative child → absolute (layout mounts at "/")
    if (SKIP_EXACT.has(p)) continue;
    if (/[:\[]/.test(p)) continue;                 // dynamic param (:id or [id]) — no concrete value
    if (p.includes('*')) continue;
    if (opts.exclude && opts.exclude.some(rx => new RegExp(rx).test(p))) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    routes.push({ path: p, label: humanize(p) });
  }
  routes.sort((a, b) => a.path.localeCompare(b.path));
  return opts.max ? routes.slice(0, opts.max) : routes;
}
