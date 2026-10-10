import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, WheelEvent } from 'react';
import type { GameState, LiveNode, NodeTemplate } from '../types/game';
import { layoutMap } from '../engine/mapLayout';
import type { PlacedGroup, PlacedNode } from '../engine/mapLayout';
import { centreOn, fitView, isVisible, panBy, zoomAt } from '../engine/mapView';
import type { Size, View } from '../engine/mapView';

const GROUPS_KEY = 'irongate_map_groups';
const GROUP_ID = /^group:[0-5]:[a-z_]+$/;
const DEFAULT_BOX: Size = { w: 800, h: 480 };
const PAN_STEP = 40;
const ZOOM_STEP = 1.2;
const LABEL_MAX = 18;

const readExpanded = (): Set<string> => {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(GROUPS_KEY) ?? 'null');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string' && GROUP_ID.test(v)));
  } catch {
    return new Set();
  }
};

const writeExpanded = (ids: ReadonlySet<string>) => {
  try {
    sessionStorage.setItem(GROUPS_KEY, JSON.stringify([...ids]));
  } catch {
    // storage unavailable: the choice lasts as long as the component
  }
};

// Simple 24x24 line art, one per template.
const GLYPHS: Record<NodeTemplate, string> = {
  workstation: 'M3 4h18v12H3z M9 20h6 M12 16v4',
  database_server: 'M5 6c0-2 14-2 14 0s-14 2-14 0z M5 6v12c0 2 14 2 14 0V6 M5 12c0 2 14 2 14 0',
  file_server: 'M4 4h16v4H4z M4 10h16v4H4z M4 16h16v4H4z',
  web_server:
    'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 3c-4 4-4 14 0 18 M12 3c4 4 4 14 0 18 M3 12h18',
  security_node: 'M12 3l8 3v6c0 5-4 8-8 9c-4-1-8-4-8-9V6z',
  mail_server: 'M3 6h18v13H3z M3 6l9 7l9-7',
  iot_device: 'M7 7h10v10H7z M10 3v4 M14 3v4 M10 17v4 M14 17v4 M3 10h4 M3 14h4 M17 10h4 M17 14h4',
  router_switch: 'M3 8h18v10H3z M7 5l-3 3l3 3 M17 15l3 3l-3 3',
  printer: 'M6 9V3h12v6 M4 9h16v8H4z M7 14h10v7H7z',
  dev_server: 'M8 6l-6 6l6 6 M16 6l6 6l-6 6 M14 4l-4 16',
};

const ACCESS_BADGE = { none: '', user: 'U', admin: 'A', root: 'R' } as const;

const truncate = (s: string): string =>
  s.length > LABEL_MAX ? `${s.slice(0, LABEL_MAX - 1)}…` : s;

const nodeName = (n: LiveNode, current: boolean): string =>
  [
    `${n.label}, ${n.ip}`,
    current && 'current',
    n.accessLevel !== 'none' && `${n.accessLevel} access`,
    n.compromised && 'compromised',
    n.sentinelPatched && 'patched',
    n.locked && 'locked',
  ]
    .filter(Boolean)
    .join(', ');

const Glyph = ({ template }: { template: NodeTemplate }) => (
  <path
    d={GLYPHS[template]}
    stroke="currentColor"
    fill="none"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    transform="translate(-12 -12)"
  />
);

const MapNode = ({ item, current }: { item: PlacedNode; current: boolean }) => {
  const n = item.node;
  return (
    <g
      className="map-node"
      tabIndex={0}
      role="img"
      aria-label={nodeName(n, current)}
      transform={`translate(${String(item.x)} ${String(item.y)})`}
      data-node-id={n.id}
      data-current={String(current)}
      data-access={n.accessLevel}
      data-compromised={String(n.compromised)}
      data-patched={String(!!n.sentinelPatched)}
      data-locked={String(!!n.locked)}>
      {current && <circle className="map-ring" r={28} />}
      <circle className="map-disc" r={22} />
      <Glyph template={n.template} />
      {n.accessLevel !== 'none' && (
        <text className="map-badge" x={20} y={-16}>
          {ACCESS_BADGE[n.accessLevel]}
        </text>
      )}
      {n.compromised && (
        <text className="map-badge map-bang" x={-24} y={-16}>
          !
        </text>
      )}
      {n.locked && (
        <path
          className="map-lock"
          d="M-5 -2h10v8h-10z M-3 -2v-3a3 3 0 0 1 6 0v3"
          transform="translate(0 0)"
        />
      )}
      <text className="map-label" y={40} textAnchor="middle">
        {truncate(n.label)}
      </text>
      <text className="map-ip" y={53} textAnchor="middle">
        {n.ip}
      </text>
    </g>
  );
};

const MapGroup = ({ item, onToggle }: { item: PlacedGroup; onToggle: (id: string) => void }) => {
  const count = item.memberIds.length;
  const name = item.template.replace(/_/g, ' ');
  return (
    <g
      className="map-group"
      tabIndex={0}
      role="button"
      aria-expanded={item.expanded}
      aria-label={`${String(count)} ${name} hosts, press to ${item.expanded ? 'collapse' : 'expand'}`}
      transform={`translate(${String(item.x)} ${String(item.y)})`}
      data-group-id={item.id}
      onClick={() => {
        onToggle(item.id);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onToggle(item.id);
        }
      }}>
      <rect x={-70} y={-16} width={140} height={32} rx={4} />
      <text textAnchor="middle" y={4}>
        {item.expanded ? `− ${String(count)} ${name}` : `+${String(count)} ${name}`}
      </text>
    </g>
  );
};

export const NetworkMap = ({ gameState }: { gameState: GameState }) => {
  const [expanded, setExpanded] = useState(readExpanded);
  useEffect(() => {
    writeExpanded(expanded);
  }, [expanded]);

  const layout = useMemo(() => layoutMap(gameState, expanded), [gameState, expanded]);
  const ref = useRef<HTMLDivElement>(null);
  const boxSize = (): Size => {
    const el = ref.current;
    if (!el?.clientWidth || !el.clientHeight) return DEFAULT_BOX;
    return { w: el.clientWidth, h: el.clientHeight };
  };
  const content = { w: layout.width, h: layout.height };

  const [view, setView] = useState<View>(() => fitView(content, DEFAULT_BOX));
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    setView(fitView(content, boxSize()));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit once on mount
  }, []);

  // Re-centre only when the current node changes, so an unrelated turn never moves the view.
  const latest = useRef({ layout, view });
  useEffect(() => {
    latest.current = { layout, view };
  });
  const currentId = gameState.network.currentNodeId;
  useEffect(() => {
    const p = (
      latest.current.layout.positions as Partial<Record<string, { x: number; y: number }>>
    )[currentId];
    if (p && !isVisible(latest.current.view, p, boxSize())) {
      setView(centreOn(latest.current.view, p, boxSize()));
    }
  }, [currentId]);

  const zoom = (factor: number) => {
    const box = boxSize();
    setView(v => zoomAt(v, factor, box.w / 2, box.h / 2));
  };
  const fit = () => {
    setView(fitView(content, boxSize()));
  };
  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest('.map-node, .map-group')) return;
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const from = drag.current;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setView(v => panBy(v, dx, dy));
  };
  const endDrag = () => {
    drag.current = null;
  };
  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    const cx = e.clientX - (rect?.left ?? 0);
    const cy = e.clientY - (rect?.top ?? 0);
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    setView(v => zoomAt(v, factor, cx, cy));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('button')) return;
    const pans: Partial<Record<string, [number, number]>> = {
      ArrowRight: [PAN_STEP, 0],
      ArrowLeft: [-PAN_STEP, 0],
      ArrowDown: [0, PAN_STEP],
      ArrowUp: [0, -PAN_STEP],
    };
    const pan = pans[e.key];
    if (pan) {
      e.preventDefault();
      setView(v => panBy(v, pan[0], pan[1]));
    } else if (e.key === '+' || e.key === '=') zoom(ZOOM_STEP);
    else if (e.key === '-') zoom(1 / ZOOM_STEP);
    else if (e.key === '0') fit();
  };

  return (
    <div
      ref={ref}
      className="network-map"
      role="region"
      aria-label="Network map"
      data-testid="network-map"
      onKeyDown={onKeyDown}>
      <svg
        className="network-map-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onWheel={onWheel}>
        <defs>
          <pattern
            id="map-hatch"
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)">
            <rect width={6} height={6} fill="var(--color-bg)" />
            <line x1={0} y1={0} x2={0} y2={6} stroke="var(--color-aggressive)" strokeWidth={2} />
          </pattern>
        </defs>
        <g
          data-testid="map-world"
          transform={`translate(${String(view.x)} ${String(view.y)}) scale(${String(view.k)})`}>
          {layout.columns.map(c => (
            <text key={c.layer} className="map-col" x={c.x} y={24} textAnchor="middle">
              L{c.layer} {c.label}
            </text>
          ))}
          {layout.links.map(l => (
            <line
              key={l.id}
              className="map-link"
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              data-link-id={l.id}
              data-current={String(l.touchesCurrent)}
              data-patched={String(l.patched)}
            />
          ))}
          {layout.items.map(item =>
            item.kind === 'group' ? (
              <MapGroup key={item.id} item={item} onToggle={toggle} />
            ) : (
              <MapNode key={item.id} item={item} current={item.id === currentId} />
            ),
          )}
        </g>
      </svg>
      <div className="network-map-controls">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => {
            zoom(ZOOM_STEP);
          }}>
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => {
            zoom(1 / ZOOM_STEP);
          }}>
          −
        </button>
        <button type="button" aria-label="Fit to window" onClick={fit}>
          fit
        </button>
      </div>
    </div>
  );
};
