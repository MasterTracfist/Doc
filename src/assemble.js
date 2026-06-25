// ASSEMBLE — bin classified markdown into target documents, order sections, resolve image references.
import fs from 'node:fs';
import path from 'node:path';

const ORDER_INDEX = (cfg) => {
  const map = {};
  cfg.sectionOrder.forEach((t, i) => { map[t] = i; });
  // doc-type names from classify -> sectionOrder buckets
  map['how-to'] = map['how-to'] ?? 1;
  map['troubleshoot'] = map['troubleshooting'] ?? 5;
  return map;
};

// Find image artifacts referenced by a markdown file (relative ![]() links) and resolve to manifest entries.
function linkImages(mdArt, images) {
  let body;
  try { body = fs.readFileSync(mdArt.path, 'utf8'); } catch { return []; }
  const refs = [...body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1].split(' ')[0]);
  const dir = path.dirname(mdArt.path);
  const linked = [];
  for (const ref of refs) {
    if (/^https?:\/\//.test(ref)) continue;
    const abs = path.resolve(dir, ref);
    const hit = images.find(im => im.path === abs);
    if (hit) { hit.referenced = true; linked.push(hit); }
  }
  return linked;
}

export function assemble(manifest, cfg) {
  const order = ORDER_INDEX(cfg);
  const images = manifest.filter(a => a.kind === 'image');
  const mds = manifest.filter(a => a.kind === 'markdown');

  // Associate referenced images.
  for (const md of mds) md.linkedImages = linkImages(md, images);

  const documents = cfg.documents.map(def => {
    const sections = mds
      .filter(m => m.document === def.id)
      .sort((a, b) => {
        const oa = order[a.docType] ?? 99;
        const ob = order[b.docType] ?? 99;
        if (oa !== ob) return oa - ob;
        // README/overview of each repo first, then alpha by repo+title
        return (a.repo + a.title).localeCompare(b.repo + b.title);
      });
    return { ...def, sections };
  }).filter(d => d.sections.length > 0);

  // Orphan screenshots: images never referenced by any markdown.
  const orphanImages = images.filter(im => !im.referenced);

  // Gap detection: declared documents with no content; repos with images but no docs.
  const emptyDocs = cfg.documents.filter(d => !documents.find(x => x.id === d.id)).map(d => d.title);

  const stats = {
    markdown: mds.length,
    images: images.length,
    referencedImages: images.filter(i => i.referenced).length,
    orphanImages: orphanImages.length,
    documents: documents.length,
    other: manifest.filter(a => a.kind === 'other').length,
    byRepo: {}
  };
  for (const m of mds) stats.byRepo[m.repo] = (stats.byRepo[m.repo] || 0) + 1;

  return { documents, orphanImages, emptyDocs, stats };
}
