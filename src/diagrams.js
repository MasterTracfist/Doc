// DIAGRAMS — synthesize SVG images from the scanned stack + entity model. Pure string building, no deps.
const C = {
  ink: '#e6e9ef', muted: '#9aa4b2', panel: '#171a21', line: '#2b313c', bg: '#0f1115',
  tier: {
    device: '#f56fb0', client: '#4f9cf9', bus: '#f5a623', service: '#5fd17a',
    data: '#b07cf0', obs: '#e0708a', ai: '#3fd0d0', ext: '#9aa4b2',
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function box(x, y, w, h, title, sub, color) {
  return `<g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${C.panel}" stroke="${color}" stroke-width="1.5"/>
  <rect x="${x}" y="${y}" width="4" height="${h}" rx="2" fill="${color}"/>
  <text x="${x + 14}" y="${y + (sub ? 22 : h / 2 + 5)}" fill="${C.ink}" font-size="14" font-weight="600" font-family="-apple-system,Segoe UI,Roboto,sans-serif">${esc(title)}</text>
  ${sub ? `<text x="${x + 14}" y="${y + 40}" fill="${C.muted}" font-size="11.5" font-family="-apple-system,Segoe UI,Roboto,sans-serif">${esc(sub)}</text>` : ''}
</g>`;
}

// ── System architecture: tiered boxes with flow arrows between tiers ──────────
export function architectureSVG(scan) {
  const W = 1180, BOX_W = 220, BOX_H = 52, GAP = 22, ROW_H = 116, PAD_TOP = 70;
  const repos = scan.repos;
  const infra = scan.infra;

  const rows = [
    { key: 'Devices & Clients', items: [
      ...repos.filter(r => r.tier === 'device').map(r => ({ t: r.repo, s: `${r.framework} · ${r.lang}`, c: C.tier.device })),
      ...repos.filter(r => r.tier === 'client').map(r => ({ t: r.repo, s: r.framework, c: C.tier.client })),
    ] },
    { key: 'Ingest & Event Bus', items: infra.filter(i => i.tier === 'bus').map(i => ({ t: i.name, s: i.role, c: C.tier.bus })) },
    { key: 'Services', items: repos.filter(r => r.tier === 'service').map(r => ({ t: r.repo, s: `${r.framework}`, c: C.tier.service })) },
    { key: 'Data Stores', items: infra.filter(i => i.tier === 'data').map(i => ({ t: i.name, s: i.role, c: C.tier.data })) },
    { key: 'Observability / AI / External', items: [
      ...infra.filter(i => i.tier === 'obs').map(i => ({ t: i.name, s: i.role, c: C.tier.obs })),
      ...infra.filter(i => i.tier === 'ai').map(i => ({ t: i.name, s: i.role, c: C.tier.ai })),
      ...infra.filter(i => i.tier === 'ext').map(i => ({ t: i.name, s: i.role, c: C.tier.ext })),
    ] },
  ].filter(r => r.items.length);

  const H = PAD_TOP + rows.length * ROW_H + 20;
  let body = '';
  const rowY = (i) => PAD_TOP + i * ROW_H;

  rows.forEach((row, ri) => {
    const n = row.items.length;
    const rowW = n * BOX_W + (n - 1) * GAP;
    const startX = (W - rowW) / 2;
    body += `<text x="40" y="${rowY(ri) - 14}" fill="${C.muted}" font-size="12" letter-spacing="0.08em" font-family="-apple-system,Segoe UI,Roboto,sans-serif">${row.key.toUpperCase()}</text>`;
    row.items.forEach((it, ci) => {
      body += box(startX + ci * (BOX_W + GAP), rowY(ri), BOX_W, BOX_H, it.t, it.s, it.c);
    });
  });

  // representative flow arrows between consecutive tier centers
  let arrows = '';
  for (let i = 0; i < rows.length - 1; i++) {
    const y1 = rowY(i) + BOX_H, y2 = rowY(i + 1);
    arrows += `<line x1="${W / 2}" y1="${y1}" x2="${W / 2}" y2="${y2}" stroke="${C.line}" stroke-width="2" marker-end="url(#arr)"/>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
<defs><marker id="arr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${C.muted}"/></marker></defs>
<rect width="${W}" height="${H}" rx="12" fill="${C.bg}"/>
<text x="40" y="40" fill="${C.ink}" font-size="20" font-weight="700">System Architecture</text>
${arrows}${body}
</svg>`;
}

// ── Data model: entity boxes on a grid, edges for relations (hubs sorted first) ─
export function dataModelSVG(model) {
  const { entities, edges, hubs } = model;
  const COLS = 6, BOX_W = 168, BOX_H = 54, GX = 24, GY = 30, PAD = 70;
  // order: hubs first (top rows), then the rest alphabetically
  const ordered = [
    ...hubs.map(h => entities.find(e => e.name === h)).filter(Boolean),
    ...entities.filter(e => !hubs.includes(e.name)).sort((a, b) => a.name.localeCompare(b.name)),
  ];
  const pos = new Map();
  ordered.forEach((e, i) => {
    const col = i % COLS, rowi = Math.floor(i / COLS);
    pos.set(e.name, { x: 40 + col * (BOX_W + GX), y: PAD + rowi * (BOX_H + GY), cx: 40 + col * (BOX_W + GX) + BOX_W / 2, cy: PAD + rowi * (BOX_H + GY) + BOX_H / 2 });
  });
  const rows = Math.ceil(ordered.length / COLS);
  const W = 40 * 2 + COLS * BOX_W + (COLS - 1) * GX;
  const H = PAD + rows * (BOX_H + GY) + 10;

  // edges first (under boxes)
  let edgeSvg = '';
  for (const e of edges) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    const hub = hubs.includes(e.to);
    edgeSvg += `<line x1="${a.cx}" y1="${a.cy}" x2="${b.cx}" y2="${b.cy}" stroke="${hub ? C.tier.data : C.line}" stroke-width="${hub ? 1.1 : 0.8}" opacity="${hub ? 0.5 : 0.3}"/>`;
  }
  let boxes = '';
  for (const e of ordered) {
    const p = pos.get(e.name);
    const isHub = hubs.includes(e.name);
    boxes += box(p.x, p.y, BOX_W, BOX_H, e.name, `${e.table} · ${e.columns.length} cols`, isHub ? C.tier.client : C.tier.ext);
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
<rect width="${W}" height="${H}" rx="12" fill="${C.bg}"/>
<text x="40" y="34" fill="${C.ink}" font-size="20" font-weight="700">Data Model</text>
<text x="40" y="54" fill="${C.muted}" font-size="12.5">${entities.length} entities · ${edges.length} relations · hubs: ${hubs.join(', ')}</text>
${edgeSvg}${boxes}
</svg>`;
}

// ── Data pipeline: a clean left-to-right flow of components ──
// `steps` is an array of { t, s, tier } (built by generate.js from config or the scanned stack);
// `title` defaults to a generic label. The engine itself is project-agnostic — any data path
// (telemetry, ETL, request flow) is described entirely by the supplied steps.
export function pipelineSVG(steps, title = 'Data Pipeline') {
  steps = (steps || []).map(s => ({ t: s.t, s: s.s, c: C.tier[s.tier] || C.tier.ext }));
  const BW = 168, BH = 60, GAP = 56, PAD = 40, Y = 70;
  const W = PAD * 2 + steps.length * BW + (steps.length - 1) * GAP;
  const H = 170;
  let body = '', arrows = '';
  steps.forEach((st, i) => {
    const x = PAD + i * (BW + GAP);
    body += box(x, Y, BW, BH, st.t, st.s, st.c);
    if (i < steps.length - 1) {
      const ax = x + BW, bx = x + BW + GAP;
      arrows += `<line x1="${ax}" y1="${Y + BH / 2}" x2="${bx}" y2="${Y + BH / 2}" stroke="${C.muted}" stroke-width="2" marker-end="url(#arr2)"/>`;
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
<defs><marker id="arr2" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${C.muted}"/></marker></defs>
<rect width="${W}" height="${H}" rx="12" fill="${C.bg}"/>
<text x="${PAD}" y="40" fill="${C.ink}" font-size="20" font-weight="700">${esc(title)}</text>
${arrows}${body}
</svg>`;
}
