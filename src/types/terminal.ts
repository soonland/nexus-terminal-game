export type LineType = 'output' | 'input' | 'system' | 'error' | 'separator' | 'aria' | 'dm';

/**
 * Alias for {@link LineType} — satisfies the spec's TerminalLineType requirement.
 * @deprecated Use {@link LineType} directly. This alias exists only for spec naming compliance.
 */
export type TerminalLineType = LineType;

export interface TerminalLine {
  id: string;
  type: LineType;
  content: string;
  timestamp: number;
}

export type DangerLevel = 'safe' | 'elevated' | 'active' | 'aggressive' | 'burned';

interface TraceLevel {
  value: number; // 0–100
  label: DangerLevel;
  color: string;
}

export const getTraceLevel = (value: number): TraceLevel => {
  if (value <= 30) return { value, label: 'safe', color: 'var(--color-safe)' };
  if (value <= 60) return { value, label: 'elevated', color: 'var(--color-elevated)' };
  if (value <= 85) return { value, label: 'active', color: 'var(--color-active)' };
  if (value <= 99) return { value, label: 'aggressive', color: 'var(--color-aggressive)' };
  return { value, label: 'burned', color: 'var(--color-error)' };
};

export const makeLine = (type: LineType, content: string): TerminalLine => {
  return { id: crypto.randomUUID(), type, content, timestamp: Date.now() };
};
