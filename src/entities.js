// ENTITY SCAN — parse TypeORM entity classes into a small ER model for the data-model diagram.
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.entity.ts')) out.push(full);
  }
}

function singular(s) { return s.replace(/s$/, ''); }

function parseFile(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const cls = txt.match(/export\s+class\s+([A-Za-z0-9_]+)/);
  if (!cls) return null;
  const name = cls[1];
  const tableM = txt.match(/@Entity\(\s*['"`]([^'"`]+)['"`]/);
  const table = tableM ? tableM[1] : name.toLowerCase();

  // columns: any decorated property of the form `@Column(...) prop!:` etc.
  const cols = [];
  const colRe = /@(?:Column|PrimaryGeneratedColumn|PrimaryColumn|CreateDateColumn|UpdateDateColumn)\b[^\n]*\)?\s*([a-zA-Z0-9_]+)\s*[!?]?:/g;
  let m;
  while ((m = colRe.exec(txt))) cols.push(m[1]);

  // explicit relations
  const relations = [];
  const relRe = /@(ManyToOne|OneToMany|ManyToMany|OneToOne)\(\s*\(\)\s*=>\s*([A-Za-z0-9_]+)/g;
  while ((m = relRe.exec(txt))) relations.push({ kind: m[1], target: m[2] });

  // foreign-key-ish columns (e.g. tenant_id / deviceId) for inferred links
  const fkCols = [...new Set(cols.filter(c => /(_id$|Id$)/.test(c) && c !== 'id'))];

  return { name, table, file, columns: [...new Set(cols)], relations, fkCols };
}

export function scanEntities(root) {
  const files = [];
  walk(path.join(root, 'src'), files);
  const entities = files.map(parseFile).filter(Boolean);
  const byName = new Map(entities.map(e => [e.name.toLowerCase(), e]));

  // Build an edge set: explicit relation decorators + inferred FK columns -> matching entity.
  const edges = [];
  const push = (from, to, kind) => {
    if (!to || from === to) return;
    if (!edges.find(e => e.from === from && e.to === to)) edges.push({ from, to, kind });
  };
  for (const e of entities) {
    for (const r of e.relations) {
      const t = byName.get(r.target.toLowerCase());
      if (t) push(e.name, t.name, r.kind);
    }
    for (const fk of e.fkCols) {
      const base = singular(fk.replace(/(_id|Id)$/, '').replace(/_/g, '').toLowerCase());
      const t = byName.get(base);
      if (t) push(e.name, t.name, 'fk');
    }
  }
  // hub entities = most-referenced targets (Device, Tenant…), used to lay out the diagram.
  const inDeg = {};
  for (const e of edges) inDeg[e.to] = (inDeg[e.to] || 0) + 1;
  const hubs = Object.entries(inDeg).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);

  return { entities, edges, hubs };
}
