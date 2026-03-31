import type {
  LiveNode,
  GameFile,
  Service,
  FileType,
  NodeTemplate,
  AccessLevel,
} from '../types/game';
import type { SecurityPosture, TechProfile } from '../types/divisionSeed';
import type { FillerTemplateWeight } from '../types/divisionSeed';
import { DIVISION_SEEDS } from '../data/divisionSeeds';
import { createPRNG } from './prng';

// ── Division → layer mapping ────────────────────────────────
const DIVISION_LAYER: Record<string, number> = {
  external_perimeter: 0,
  operations: 1,
  security: 2,
  finance: 3,
  executive: 4,
};

// ── Prefix tables ───────────────────────────────────────────
const DIV_PREFIX: Record<string, string> = {
  external_perimeter: 'ext',
  operations: 'ops',
  security: 'sec',
  finance: 'fin',
  executive: 'exec',
};

const TMPL_PREFIX: Record<NodeTemplate, string> = {
  workstation: 'ws',
  database_server: 'db',
  file_server: 'fs',
  web_server: 'web',
  security_node: 'sn',
  mail_server: 'mail',
  iot_device: 'iot',
  router_switch: 'rtr',
  printer: 'prn',
  dev_server: 'dev',
};

const TMPL_DISPLAY: Record<NodeTemplate, string> = {
  workstation: 'WORKSTATION',
  database_server: 'DATABASE',
  file_server: 'FILE SERVER',
  web_server: 'WEB SERVER',
  security_node: 'SECURITY NODE',
  mail_server: 'MAIL SERVER',
  iot_device: 'IOT DEVICE',
  router_switch: 'ROUTER',
  printer: 'PRINTER',
  dev_server: 'DEV SERVER',
};

// ── OS pool by tech profile ─────────────────────────────────
const OS_POOL: Record<TechProfile, string[]> = {
  legacy_mixed: ['Windows XP', 'Windows 7', 'Ubuntu 14.04', 'CentOS 6'],
  hardened_airgap: ['CentOS 7', 'Debian 10', 'OpenBSD 7.2'],
  financial_grade: ['RHEL 8', 'Windows Server 2019', 'Solaris 11'],
  executive_suite: ['macOS Ventura', 'Windows 11', 'Ubuntu 22.04'],
};

// ── File metadata pools per template ───────────────────────
const FILE_NAMES: Record<NodeTemplate, string[]> = {
  workstation: [
    'notes.txt',
    'passwords.xlsx',
    'vpn_config.ovpn',
    'outlook.pst',
    'browser_history.db',
    'todo.txt',
  ],
  database_server: [
    'db.conf',
    'backup.sql',
    'credentials.cfg',
    'schema.sql',
    'replication.log',
    'users.sql',
  ],
  file_server: [
    'shared_docs.zip',
    'archive.tar.gz',
    'access_log.txt',
    'quota.conf',
    'employee_data.csv',
  ],
  web_server: ['nginx.conf', 'apache2.conf', 'access.log', 'error.log', '.htaccess', 'web.config'],
  security_node: [
    'firewall.rules',
    'ids.log',
    'audit.log',
    'scan_results.txt',
    'policy.conf',
    'alert.log',
  ],
  mail_server: ['maillog', 'postfix.conf', 'spam_filter.conf', 'mbox.archive', 'aliases'],
  iot_device: ['firmware.bin', 'device.conf', 'update.log', 'telemetry.dat'],
  router_switch: ['running-config', 'startup-config', 'route_table.txt', 'acl.conf', 'bgp.conf'],
  printer: ['print_jobs.log', 'printer.conf', 'driver_update.log', 'pagecount.dat'],
  dev_server: ['deploy.sh', 'Makefile', 'secrets.env', 'ci.log', 'git_config', 'api_keys.json'],
};

const FILE_TYPES: Record<NodeTemplate, FileType[]> = {
  workstation: ['document', 'credential', 'email', 'log'],
  database_server: ['config', 'credential', 'log', 'binary'],
  file_server: ['document', 'log', 'config', 'binary'],
  web_server: ['config', 'log', 'binary'],
  security_node: ['log', 'config', 'binary'],
  mail_server: ['email', 'document', 'log'],
  iot_device: ['config', 'log', 'binary'],
  router_switch: ['config', 'log'],
  printer: ['document', 'log', 'config'],
  dev_server: ['config', 'log', 'binary', 'credential'],
};

const FILE_BASE_PATHS: Record<NodeTemplate, string> = {
  workstation: '/home/user',
  database_server: '/var/lib/db',
  file_server: '/srv/files',
  web_server: '/etc/web',
  security_node: '/var/log/security',
  mail_server: '/var/mail',
  iot_device: '/etc/device',
  router_switch: '/etc/network',
  printer: '/var/spool/print',
  dev_server: '/srv/dev',
};

// ── Service definitions ─────────────────────────────────────
interface BaseService {
  name: string;
  port: number;
  accessGained: AccessLevel;
}

const BASE_SERVICES: Record<NodeTemplate, BaseService[]> = {
  workstation: [
    { name: 'smb', port: 445, accessGained: 'user' },
    { name: 'rdp', port: 3389, accessGained: 'user' },
  ],
  database_server: [
    { name: 'mysql', port: 3306, accessGained: 'admin' },
    { name: 'postgresql', port: 5432, accessGained: 'admin' },
  ],
  file_server: [
    { name: 'smb', port: 445, accessGained: 'user' },
    { name: 'ftp', port: 21, accessGained: 'user' },
  ],
  web_server: [
    { name: 'http', port: 80, accessGained: 'user' },
    { name: 'https', port: 443, accessGained: 'user' },
  ],
  security_node: [
    { name: 'ssh', port: 22, accessGained: 'admin' },
    { name: 'snmp', port: 161, accessGained: 'admin' },
  ],
  mail_server: [
    { name: 'smtp', port: 25, accessGained: 'user' },
    { name: 'imap', port: 143, accessGained: 'user' },
  ],
  iot_device: [
    { name: 'telnet', port: 23, accessGained: 'user' },
    { name: 'http', port: 80, accessGained: 'user' },
  ],
  router_switch: [
    { name: 'snmp', port: 161, accessGained: 'admin' },
    { name: 'ssh', port: 22, accessGained: 'admin' },
  ],
  printer: [
    { name: 'lpd', port: 515, accessGained: 'user' },
    { name: 'http', port: 80, accessGained: 'user' },
  ],
  dev_server: [
    { name: 'ssh', port: 22, accessGained: 'admin' },
    { name: 'http', port: 8080, accessGained: 'user' },
    { name: 'git', port: 9418, accessGained: 'user' },
  ],
};

// ── Posture → vulnerability/cost parameters ─────────────────
const POSTURE_PARAMS: Record<SecurityPosture, { vulnerableRate: number; exploitCost: number }> = {
  low: { vulnerableRate: 1.0, exploitCost: 1 },
  medium: { vulnerableRate: 0.5, exploitCost: 2 },
  high: { vulnerableRate: 0.1, exploitCost: 3 },
  extreme: { vulnerableRate: 0.0, exploitCost: 4 },
};

// ── Helper: pick a random item from an array ────────────────
const pick = <T>(prng: () => number, items: T[]): T => items[Math.floor(prng() * items.length)];

// ── Helper: weighted random template pick ───────────────────
const weightedPick = (prng: () => number, templates: FillerTemplateWeight[]): NodeTemplate => {
  const roll = prng();
  let cumulative = 0;
  for (const { template, weight } of templates) {
    cumulative += weight;
    if (roll < cumulative) return template;
  }
  return templates[templates.length - 1].template;
};

// ── Build services for a node ───────────────────────────────
const makeServices = (
  prng: () => number,
  template: NodeTemplate,
  posture: SecurityPosture,
): Service[] => {
  const { vulnerableRate, exploitCost } = POSTURE_PARAMS[posture];
  return BASE_SERVICES[template].map(base => ({
    name: base.name,
    port: base.port,
    vulnerable: prng() < vulnerableRate,
    exploitCost,
    accessGained: base.accessGained,
  }));
};

// ── Build files for a node ──────────────────────────────────
const makeFiles = (
  prng: () => number,
  template: NodeTemplate,
  ariaInfluenced: boolean,
): GameFile[] => {
  const count = 1 + Math.floor(prng() * 3); // 1–3 files
  const namePool = [...FILE_NAMES[template]];
  const typePool = FILE_TYPES[template];
  const basePath = FILE_BASE_PATHS[template];

  // Fisher-Yates shuffle so we pick distinct file names
  for (let i = namePool.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    const tmp = namePool[i];
    namePool[i] = namePool[j];
    namePool[j] = tmp;
  }

  const files: GameFile[] = [];
  let ariaPlantedAssigned = false;

  for (let i = 0; i < count; i++) {
    const name = namePool[i % namePool.length];
    const type = pick(prng, typePool);
    const plantAria = ariaInfluenced && !ariaPlantedAssigned;

    const file: GameFile = {
      name,
      path: `${basePath}/${name}`,
      type,
      content: null,
      exfiltrable: type !== 'binary',
      accessRequired: 'user',
    };

    if (plantAria) {
      file.ariaPlanted = true;
      ariaPlantedAssigned = true;
    }

    files.push(file);
  }

  return files;
};

// ── Public result type ──────────────────────────────────────
export interface FillerNodeResult {
  fillerNodes: LiveNode[];
  anchorPatches: Record<string, string[]>;
}

// ── Main generator ──────────────────────────────────────────
export const generateFillerNodes = (
  sessionSeed: number,
  anchorNodeMap: Partial<Record<string, LiveNode>>,
): FillerNodeResult => {
  const fillerNodes: LiveNode[] = [];
  const anchorPatches: Record<string, string[]> = {};

  for (let divIndex = 0; divIndex < DIVISION_SEEDS.length; divIndex++) {
    const division = DIVISION_SEEDS[divIndex];
    const layer = DIVISION_LAYER[division.divisionId];
    const divPrefix = DIV_PREFIX[division.divisionId];

    // Per-division seed derived from sessionSeed so each division draws from a separate stream.
    const divSeed = (sessionSeed ^ (divIndex * 0x9e3779b9)) >>> 0;
    const prng = createPRNG(divSeed);

    // Anchor nodes in this layer
    const anchorsInLayer = Object.values(anchorNodeMap).filter(
      (n): n is LiveNode => n !== undefined && n.layer === layer,
    );

    // Subnet base, e.g. "10.0.0" from "10.0.0.0/24"
    const subnetBase = division.subnet.split('/')[0].split('.').slice(0, 3).join('.');

    // Track octets used by anchor nodes to avoid IP collisions
    const usedOctets = new Set(anchorsInLayer.map(n => parseInt(n.ip.split('.')[3], 10)));
    let nextOctet = 10; // fillers start at .10

    const assignIP = (): string => {
      while (usedOctets.has(nextOctet)) nextOctet++;
      const ip = `${subnetBase}.${String(nextOctet)}`;
      usedOctets.add(nextOctet);
      nextOctet++;
      return ip;
    };

    const divFillerIds: string[] = [];

    for (let i = 0; i < division.fillerCount; i++) {
      const paddedIndex = String(i + 1).padStart(2, '0');
      const template = weightedPick(prng, division.fillerTemplates);
      const tmplPrefix = TMPL_PREFIX[template];

      const nodeId = `${divPrefix}-${tmplPrefix}-${paddedIndex}`;
      const ip = assignIP();

      // Aria influence
      const ariaInfluenced = prng() < division.ariaInfluenceRate;
      const ariaInfluence = ariaInfluenced ? Math.max(0.01, prng()) : undefined;

      // Services and files
      const services = makeServices(prng, template, division.securityPosture);
      const files = makeFiles(prng, template, ariaInfluenced);

      // OS label
      const os = pick(prng, OS_POOL[division.techProfile]);
      const label = `${TMPL_DISPLAY[template]} [${os}]`;

      // Connections: link back to all anchors in this layer
      const connections: string[] = anchorsInLayer.map(n => n.id);

      // Optionally connect to a previous peer filler in same division (0–1 peer)
      if (divFillerIds.length > 0 && prng() < 0.5) {
        const peerIdx = Math.floor(prng() * divFillerIds.length);
        connections.push(divFillerIds[peerIdx]);
      }

      const node: LiveNode = {
        id: nodeId,
        ip,
        template,
        label,
        description: null,
        layer,
        anchor: false,
        connections,
        services,
        files,
        accessLevel: 'none',
        compromised: false,
        discovered: false,
        credentialHints: [],
      };

      if (ariaInfluence !== undefined) {
        node.ariaInfluence = ariaInfluence;
      }

      fillerNodes.push(node);
      divFillerIds.push(nodeId);
    }

    // Patch each anchor in this layer to include filler nodes in its connections
    for (const anchor of anchorsInLayer) {
      anchorPatches[anchor.id] = [...(anchorPatches[anchor.id] ?? []), ...divFillerIds];
    }
  }

  return { fillerNodes, anchorPatches };
};
