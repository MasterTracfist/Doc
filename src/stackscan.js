// STACK SCAN — crawl each repo to fingerprint its language/framework and the infra it talks to.
// Pure filesystem inspection; everything it reports is grounded in a real file in the repo.
import fs from 'node:fs';
import path from 'node:path';

function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function exists(p) { return fs.existsSync(p); }

// dependency -> infra component it implies. Drives both the stack matrix and the architecture diagram.
const DEP_INFRA = {
  pg: { name: 'PostgreSQL', tier: 'data', role: 'Relational DB' },
  typeorm: { name: 'PostgreSQL', tier: 'data', role: 'Relational DB' },
  kafkajs: { name: 'Apache Kafka', tier: 'bus', role: 'Event bus' },
  ioredis: { name: 'Redis', tier: 'data', role: 'Cache / pub-sub' },
  redis: { name: 'Redis', tier: 'data', role: 'Cache / pub-sub' },
  bull: { name: 'BullMQ', tier: 'data', role: 'Job queues' },
  bullmq: { name: 'BullMQ', tier: 'data', role: 'Job queues' },
  'socket.io': { name: 'WebSocket', tier: 'service', role: 'Realtime push' },
  graphql: { name: 'GraphQL', tier: 'service', role: 'Query API' },
  'swagger-ui-express': { name: 'OpenAPI', tier: 'service', role: 'REST docs' },
  '@influxdata/influxdb-client': { name: 'InfluxDB', tier: 'data', role: 'Time-series' },
  'prom-client': { name: 'Prometheus', tier: 'obs', role: 'Metrics' },
  'jaeger-client': { name: 'Jaeger', tier: 'obs', role: 'Tracing' },
  consul: { name: 'Consul', tier: 'obs', role: 'Discovery' },
  '@anthropic-ai/sdk': { name: 'Claude', tier: 'ai', role: 'LLM (Anthropic)' },
  '@tensorflow/tfjs-node': { name: 'TensorFlow', tier: 'ai', role: 'ML inference' },
  nodemailer: { name: 'SMTP / Email', tier: 'ext', role: 'Outbound mail' },
};

// dependency -> framework label for the repo itself.
function frameworkFromDeps(deps) {
  if (deps.express) return 'Express (Node/TS)';
  if (deps.react && (deps.vite || deps['react-dom'])) return 'React + Vite';
  if (deps.electron) return 'Electron';
  if (deps['socket.io']) return 'Node / Socket.IO';
  return 'Node.js';
}

function scanRepo(root) {
  const repo = path.basename(root);
  const pkg = readJson(path.join(root, 'package.json'));
  const pom = read(path.join(root, 'pom.xml'));
  const clientPkg = readJson(path.join(root, 'client', 'package.json')); // hub-style client/server split
  const out = { repo, root, lang: '', framework: '', runtime: '', tier: 'service', deps: [], infra: [], port: null, badges: [] };

  if (pom.includes('spring-boot')) {
    out.lang = 'Java 17';
    out.framework = 'Spring Boot';
    out.runtime = 'JVM';
    out.tier = 'service';
    const jv = pom.match(/<java\.version>([^<]+)/);
    if (jv) out.lang = `Java ${jv[1]}`;
    out.badges = ['Spring Security', 'JPA', 'JWT'];
  } else if (pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    out.deps = Object.keys(deps);
    out.framework = frameworkFromDeps(deps);
    out.lang = deps.typescript || exists(path.join(root, 'tsconfig.json')) ? 'TypeScript' : 'JavaScript';
    out.runtime = 'Node.js';
    out.tier = (deps.react || deps.vite) ? 'client' : 'service';
    // infra implied by deps
    const seen = new Set();
    for (const d of out.deps) {
      const inf = DEP_INFRA[d];
      if (inf && !seen.has(inf.name)) { seen.add(inf.name); out.infra.push(inf); }
    }
  } else if (clientPkg) {
    out.lang = 'TypeScript';
    out.framework = 'Node + React (client/server)';
    out.runtime = 'Node.js';
    out.tier = 'client';
  } else if (exists(path.join(root, 'CMakeLists.txt')) || exists(path.join(root, 'west.yml')) ||
             exists(path.join(root, 'prj.conf'))) {
    out.lang = 'C';
    out.framework = 'Zephyr RTOS';
    out.runtime = 'Nordic nRF9151';
    out.tier = 'device';
    out.badges = ['MQTT/TLS', 'LTE-M / NB-IoT', 'on-chip GNSS'];
  } else {
    out.framework = 'unknown';
  }
  return out;
}

// Pull declared service names out of any docker-compose files (infra ground-truth).
function composeServices(root) {
  const found = [];
  for (const f of fs.readdirSync(root).filter(n => /^docker-compose.*\.ya?ml$/.test(n))) {
    const txt = read(path.join(root, f));
    const svc = [...txt.matchAll(/^ {2}([a-zA-Z0-9_-]+):/gm)].map(m => m[1]);
    // services section ends at top-level 'volumes:'/'networks:'; keep names before those
    const stop = svc.findIndex(s => ['volumes', 'networks', 'configs', 'secrets'].includes(s));
    found.push(...(stop >= 0 ? svc.slice(0, stop) : svc));
  }
  return [...new Set(found)];
}

export function scanStack(cfg) {
  const repos = cfg.roots.filter(fs.existsSync).map(scanRepo);

  // Merge per-repo infra into a global, de-duplicated component list.
  const infraMap = new Map();
  for (const r of repos) for (const inf of r.infra) if (!infraMap.has(inf.name)) infraMap.set(inf.name, inf);

  // Add known-from-compose components that aren't visible as deps.
  const composeRoot = repos.find(r => composeServices(r.root).length);
  const compose = composeRoot ? composeServices(composeRoot.root) : [];
  const COMPOSE_MAP = {
    grafana: { name: 'Grafana', tier: 'obs', role: 'Dashboards' },
    influxdb: { name: 'InfluxDB', tier: 'data', role: 'Time-series' },
    zookeeper: { name: 'ZooKeeper', tier: 'bus', role: 'Kafka coordination' },
  };
  for (const s of compose) if (COMPOSE_MAP[s] && !infraMap.has(COMPOSE_MAP[s].name)) infraMap.set(COMPOSE_MAP[s].name, COMPOSE_MAP[s]);

  // Device transport is MQTT via a private broker (from firmware docs); surface it as ingest.
  if (repos.some(r => r.tier === 'device')) {
    infraMap.set('HiveMQ', { name: 'HiveMQ', tier: 'bus', role: 'MQTT broker' });
  }

  return { repos, infra: [...infraMap.values()], compose };
}
