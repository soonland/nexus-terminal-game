// ── Access levels ──────────────────────────────────────────
export type AccessLevel = 'none' | 'user' | 'admin' | 'root';

const ACCESS_RANK: Record<AccessLevel, number> = {
  none: 0,
  user: 1,
  admin: 2,
  root: 3,
};

export const hasAccess = (have: AccessLevel, need: AccessLevel): boolean => {
  return ACCESS_RANK[have] >= ACCESS_RANK[need];
};

// ── Network ────────────────────────────────────────────────
export type NodeTemplate =
  | 'workstation'
  | 'database_server'
  | 'file_server'
  | 'web_server'
  | 'security_node'
  | 'mail_server'
  | 'iot_device'
  | 'router_switch'
  | 'printer'
  | 'dev_server';

export type FileType =
  | 'log'
  | 'document'
  | 'credential'
  | 'config'
  | 'email'
  | 'binary'
  | 'tripwire';

export interface GameFile {
  name: string;
  path: string;
  type: FileType;
  content: string | null; // null = pending AI generation (Phase 3)
  exfiltrable: boolean;
  accessRequired: AccessLevel;
  ariaPlanted?: boolean;
  tripwire?: boolean; // reading costs +10 trace
}

export interface Service {
  name: string;
  port: number;
  vulnerable: boolean;
  exploitCost: number; // charges consumed
  accessGained: AccessLevel; // what you get on success
  patched?: boolean; // sentinel can set this
}

export interface LiveNode {
  id: string;
  ip: string;
  template: NodeTemplate;
  label: string; // short display name
  description: string | null; // flavour text shown on connect; null = pending AI generation (filler nodes)
  layer: number; // 0=entry, 1=ops, 2=sec, 3=fin, 4=exec, 5=aria
  anchor: boolean;
  ariaInfluence?: number; // 0–1, how much Aria has shaped this node (Phase 4+)
  connections: string[]; // node IDs reachable from here
  services: Service[];
  files: GameFile[];
  accessLevel: AccessLevel; // player's current access on this node
  compromised: boolean;
  discovered: boolean;
  locked?: boolean; // Phase 4: locked nodes cannot be connected until unlocked
  credentialHints: string[]; // credential IDs findable here
}

// ── Credentials ────────────────────────────────────────────
export interface Credential {
  id: string;
  username: string;
  password: string;
  accessLevel: AccessLevel;
  validOnNodes: string[]; // node IDs where login works
  obtained: boolean;
  source?: string;
}

// ── Tools ──────────────────────────────────────────────────
export type ToolId =
  | 'port-scanner'
  | 'exploit-kit'
  | 'log-wiper'
  | 'spoof-id'
  | 'decryptor'
  | 'aria-key';

export interface Tool {
  id: ToolId;
  name: string;
  description: string;
  used?: boolean; // for single-use tools
}

// ── Player ─────────────────────────────────────────────────
export interface Player {
  handle: string;
  trace: number; // 0–100
  charges: number; // exploit charges remaining
  credentials: Credential[];
  exfiltrated: GameFile[];
  tools: Tool[];
}

// ── Aria ───────────────────────────────────────────────────
export interface AriaMessage {
  role: 'player' | 'aria';
  content: string;
}

export interface AriaState {
  discovered: boolean;
  trustScore: number; // 0–100, hidden from player
  messageHistory: AriaMessage[];
}

// ── Session ────────────────────────────────────────────────
export type GamePhase = 'boot' | 'playing' | 'burned' | 'ended';

export interface GameState {
  phase: GamePhase;
  runId: string;
  startedAt: number;
  turnCount: number;
  recentCommands: string[]; // last 8 commands for AI context
  player: Player;
  network: {
    currentNodeId: string;
    previousNodeId: string | null;
    nodes: Partial<Record<string, LiveNode>>;
  };
  aria: AriaState;
  forks: Record<string, 'pending' | 'path_a' | 'path_b'>;
  flags: Record<string, boolean>;
}

// ── Command result ─────────────────────────────────────────
import type { LineType } from './terminal';

export interface CommandOutput {
  lines: Array<{ type: LineType; content: string }>;
  nextState?: Partial<GameState>;
}
