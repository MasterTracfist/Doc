// DISCOVER — walk configured roots, build a flat manifest of every relevant artifact.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function classifyKind(ext, cfg) {
  if (cfg.include.markdown.includes(ext)) return 'markdown';
  if (cfg.include.images.includes(ext)) return 'image';
  if (cfg.include.other.includes(ext)) return 'other';
  return null;
}

function walk(dir, root, cfg, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (cfg.ignore.includes(e.name)) continue;
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, root, cfg, out);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      const kind = classifyKind(ext, cfg);
      if (!kind) continue;
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      out.push({
        path: full,
        rel: path.relative(root, full),
        repo: path.basename(root),
        name: e.name,
        ext,
        kind,
        size: stat.size,
        mtime: stat.mtimeMs,
        hash: crypto.createHash('sha1').update(full + stat.size + stat.mtimeMs).digest('hex').slice(0, 12)
      });
    }
  }
}

export function discover(cfg) {
  const manifest = [];
  for (const root of cfg.roots) {
    if (!fs.existsSync(root)) {
      console.warn(`  ! root not found, skipping: ${root}`);
      continue;
    }
    walk(root, root, cfg, manifest);
  }
  return manifest;
}
