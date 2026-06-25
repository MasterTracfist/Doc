// GENERATE — crawl the product + tech stack and synthesize a "System Architecture" document
// whose figures (architecture, data model, telemetry pipeline) are generated SVG images.
import path from 'node:path';
import { scanStack } from './stackscan.js';
import { scanEntities } from './entities.js';
import { architectureSVG, dataModelSVG, pipelineSVG } from './diagrams.js';

export function generate(cfg) {
  const scan = scanStack(cfg);

  // Find a repo that owns TypeORM entities (the middleware) and build the ER model.
  const entityRoot = cfg.roots.find(r => /middleware/i.test(r)) || cfg.roots[0];
  let model = { entities: [], edges: [], hubs: [] };
  try { model = scanEntities(entityRoot); } catch { /* no entities */ }

  const diagrams = [
    { key: 'architecture', title: 'System architecture', svg: architectureSVG(scan),
      note: 'Generated from each repo’s framework fingerprint and the infra implied by its dependencies and docker-compose services.' },
    { key: 'pipeline', title: 'Telemetry pipeline', svg: pipelineSVG(scan),
      note: 'The canonical device→cloud data path (firmware → MQTT → Kafka → middleware → store → UI).' },
  ];
  if (model.entities.length) {
    diagrams.push({ key: 'datamodel', title: 'Data model', svg: dataModelSVG(model),
      note: `Parsed from ${model.entities.length} TypeORM \`*.entity.ts\` classes in ${path.basename(entityRoot)}; edges are explicit relations plus inferred foreign-key columns.` });
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
