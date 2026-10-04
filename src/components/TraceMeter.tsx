import { getTraceLevel } from '../types/terminal';

// A thin bar along the top edge of the COMMS pane. The number itself stays in the status bar.
export const TraceMeter = ({ trace }: { trace: number }) => {
  const value = Math.max(0, Math.min(100, Math.round(trace)));
  const level = getTraceLevel(value);
  return (
    <div
      className="trace-meter"
      role="meter"
      aria-label="Trace"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      data-level={level.label}>
      <div
        className="trace-meter-fill"
        style={{ width: `${String(value)}%`, background: level.color }}
      />
    </div>
  );
};
