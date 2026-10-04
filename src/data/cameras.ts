export const CCTV_NODE_ID = 'ops_cctv_ctrl';

// The building's floors, in the order the menu shows them.
export const FLOORS = [
  { id: 'ground', name: 'Ground floor', accent: 0x2b6cb0 },
  { id: 'operations', name: 'Operations', accent: 0xed8936 },
  { id: 'security', name: 'Security', accent: 0xe53e3e },
  { id: 'finance', name: 'Finance', accent: 0x38a169 },
  { id: 'executive', name: 'Executive', accent: 0xd69e2e },
  { id: 'sublevel', name: 'Sub-level B', accent: 0x00b5d8 },
] as const;

export type FloorId = (typeof FLOORS)[number]['id'];

export const floorName = (id: FloorId): string => FLOORS.find(f => f.id === id)?.name ?? id;

export const floorAccent = (id: FloorId): number =>
  FLOORS.find(f => f.id === id)?.accent ?? 0xffffff;

type SceneId =
  | 'lobby'
  | 'serverRoom'
  | 'securityOffice'
  | 'financeFloor'
  | 'executiveFloor'
  | 'dataHall'
  | 'vaultApproach';

export interface CameraFeed {
  // A readable slug: what the menu shows and what `view-cam` takes.
  id: string;
  // Older ids that camera_config.ini and the incident report use; `view-cam` still accepts them.
  aliases: readonly string[];
  floor: FloorId;
  name: string;
  // The room, and which camera mount in it (position, heading and pan).
  scene: SceneId;
  mount: number;
  // The deepest layer the player must have reached (holding a session) for this feed to be live.
  unlockLayer: number;
  // Set when the feed is listed before it is live: the card shown until then.
  offlineReason: string | null;
  // What `view-cam` prints for a live feed. Authored to match the viewer's scene.
  description: string;
  // Trace added when the player opens this feed.
  traceCost: number;
}

const DISABLED = 'FEED DISABLED — CEO OFFICE';

export const CAMERA_FEEDS: readonly CameraFeed[] = [
  {
    id: 'lobby-reception',
    aliases: ['cam_01'],
    floor: 'ground',
    name: 'Lobby (reception)',
    scene: 'lobby',
    mount: 0,
    unlockLayer: 1,
    offlineReason: null,
    description:
      'Main lobby, after hours. The lights are on over an empty hall: white walls, a blue band at eye level, the reception desk unattended. The camera pans slowly from left to right.',
    traceCost: 0,
  },
  {
    id: 'lobby-entrance',
    aliases: [],
    floor: 'ground',
    name: 'Lobby (entrance)',
    scene: 'lobby',
    mount: 1,
    unlockLayer: 1,
    offlineReason: null,
    description:
      'Lobby, seen from the street entrance. The glass doors are locked, the turnstiles idle and the elevator indicators dark. The hall is empty and brightly lit.',
    traceCost: 0,
  },
  {
    id: 'server-aisle',
    aliases: ['cam_02'],
    floor: 'operations',
    name: 'Server room (aisle)',
    scene: 'serverRoom',
    mount: 0,
    unlockLayer: 1,
    offlineReason: null,
    description:
      'Server room. Two rows of racks under white light, status lights blinking red and green in no particular order. Nothing moves; the cooling units hold a steady note.',
    traceCost: 0,
  },
  {
    id: 'server-airlock',
    aliases: [],
    floor: 'operations',
    name: 'Server room (airlock)',
    scene: 'serverRoom',
    mount: 1,
    unlockLayer: 1,
    offlineReason: null,
    description:
      'Server room, from the airlock door. The aisle runs away between the racks, an orange band along the walls. Nothing moves.',
    traceCost: 0,
  },
  {
    id: 'security-office',
    aliases: [],
    floor: 'security',
    name: 'Security office',
    scene: 'securityOffice',
    mount: 0,
    unlockLayer: 2,
    offlineReason: null,
    description:
      'Security operations office. A wall of monitors, all dark but one that shows only static, under a red band on white walls. Chairs pushed back from the desks, a cold mug beside a keyboard.',
    traceCost: 0,
  },
  {
    id: 'finance-floor',
    aliases: [],
    floor: 'finance',
    name: 'Finance floor',
    scene: 'financeFloor',
    mount: 0,
    unlockLayer: 3,
    offlineReason: null,
    description:
      'Finance floor, after hours. Rows of desks with paired monitors asleep behind glass partitions, a green band along the walls, and a ticker wall still sliding bars of light. No one is at a desk.',
    traceCost: 0,
  },
  {
    id: 'executive-corridor',
    aliases: ['cam_03'],
    floor: 'executive',
    name: 'Executive corridor',
    scene: 'executiveFloor',
    mount: 0,
    unlockLayer: 4,
    offlineReason: DISABLED,
    description:
      'Executive floor corridor, after hours. Closed doors on either side, a gold band along white walls and a runner down the middle; at the far end, the corner office. Nobody is here.',
    traceCost: 1,
  },
  {
    id: 'executive-office',
    aliases: [],
    floor: 'executive',
    name: 'Corner office',
    scene: 'executiveFloor',
    mount: 1,
    unlockLayer: 4,
    offlineReason: DISABLED,
    description:
      'Corner office, after hours. The desk lamp is off and the city glows through the window behind an empty chair. Nothing has been touched.',
    traceCost: 1,
  },
  {
    id: 'data-hall-b',
    aliases: [],
    floor: 'sublevel',
    name: 'Data hall B',
    scene: 'dataHall',
    mount: 0,
    unlockLayer: 5,
    offlineReason: null,
    description:
      'Data hall B. Sealed cold-storage arrays and accelerator racks stand in long rows under white light with a cyan band along the walls, and a vault door closes the far end. The air is still.',
    traceCost: 0,
  },
  {
    id: 'vault-door',
    aliases: [],
    floor: 'sublevel',
    name: 'Vault door',
    scene: 'vaultApproach',
    mount: 0,
    unlockLayer: 5,
    offlineReason: null,
    description:
      'Sub-level B, the vault door. A circular steel door fills the end of a white corridor, sealed, its indicator red. A faint cyan light spills from the gap beneath it, and the floor hums.',
    traceCost: 0,
  },
];
