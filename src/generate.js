// GENERATE — crawl the product + tech stack and synthesize a "System Architecture" document
// whose figures (architecture, data model, telemetry pipeline) are generated SVG images.
import path from 'node:path';
import { scanStack } from './stackscan.js';
import { scanEntities } from './entities.js';
import { architectureSVG, dataModelSVG, pipelineSVG } from './diagrams.js';

// Build the pipeline steps: an explicit `cfg.pipeline` wins; otherwise derive a sensible flow
// (edge/client → bus → services → data → client) from the scanned stack using real component names.
function pipelineSteps(cfg, scan) {
  if (Array.isArray(cfg.pipeline) && cfg.pipeline.length) {
    return cfg.pipeline.map(s => ({ t: s.title, s: s.sub || '', tier: s.tier || 'service' }));
  }
  const out = [];
  const dev = scan.repos.find(r => r.tier === 'device');
  if (dev) out.push({ t: dev.repo, s: `${dev.framework} · ${dev.lang}`, tier: 'device' });
  for (const b of scan.infra.filter(i => i.tier === 'bus')) out.push({ t: b.name, s: b.role, tier: 'bus' });
  const svc = scan.repos.find(r => r.tier === 'service');
  if (svc) out.push({ t: svc.repo, s: svc.framework, tier: 'service' });
  for (const d of scan.infra.filter(i => i.tier === 'data')) out.push({ t: d.name, s: d.role, tier: 'data' });
  const client = scan.repos.find(r => r.tier === 'client');
  if (client) out.push({ t: client.repo, s: client.framework, tier: 'client' });
  return out;
}

// Pick the repo to parse for an entity/data model: an explicit `cfg.entityRoot` substring wins;
// otherwise scan every root and keep whichever yields the most entities.
function entityModel(cfg) {
  const roots = cfg.entityRoot
    ? cfg.roots.filter(r => r.includes(cfg.entityRoot))
    : cfg.roots;
  let best = { entities: [], edges: [], hubs: [] }, bestRoot = null;
  for (const r of roots) {
    try {
      const m = scanEntities(r);
      if (m.entities.length > best.entities.length) { best = m; bestRoot = r; }
    } catch { /* no entities in this root */ }
  }
  return { model: best, root: bestRoot };
}

export function generate(cfg) {
  const scan = scanStack(cfg);
  const { model, root: entityRoot } = entityModel(cfg);

  const diagrams = [
    { key: 'architecture', title: 'System architecture', svg: architectureSVG(scan),
      note: 'Generated from each repo’s framework fingerprint and the infra implied by its dependencies and docker-compose services.' },
  ];
  const steps = pipelineSteps(cfg, scan);
  if (steps.length >= 2) {
    const title = cfg.pipelineTitle || 'Data Pipeline';
    diagrams.push({ key: 'pipeline', title: title.toLowerCase(), svg: pipelineSVG(steps, title),
      note: cfg.pipelineNote || 'The data path through the system, derived from the detected stack: edge/client → event bus → services → data stores.' });
  }
  if (model.entities.length) {
    diagrams.push({ key: 'datamodel', title: 'Data model', svg: dataModelSVG(model),
      note: `Parsed from ${model.entities.length} TypeORM \`*.entity.ts\` classes${entityRoot ? ` in ${path.basename(entityRoot)}` : ''}; edges are explicit relations plus inferred foreign-key columns.` });
  }

  return {
    doc: {
      id: 'system-architecture',
      title: 'System Architecture',
      audience: 'All readers',
      blurb: 'Auto-generated diagrams of the product and its underlying tech stack.',
    },
    diagrams,
    scan,
    model,
  };
}
