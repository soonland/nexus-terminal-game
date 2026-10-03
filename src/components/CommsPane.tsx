import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { TerminalLine } from '../types/terminal';
import { TerminalOutput } from './TerminalOutput';
import { TerminalInput } from './TerminalInput';

// How long the Nexus line is cut off before the Sentinel tab takes over.
export const INTERRUPT_MS = 700;

export interface CommsHandle {
  focus: () => void;
}

interface Props {
  sentinelEstablished: boolean;
  sentinelOpen: boolean;
  sentinelLines: TerminalLine[];
  sentinelBusy: boolean;
  // Increments each time Sentinel first cuts into the line; drives the interruption.
  interruptKey: number;
  onSend: (text: string) => void;
}

type Tab = 'nexus' | 'sentinel';

export const CommsPane = forwardRef<CommsHandle, Props>(
  (
    { sentinelEstablished, sentinelOpen, sentinelLines, sentinelBusy, interruptKey, onSend },
    ref,
  ) => {
    const [tab, setTab] = useState<Tab>('nexus');
    const [interrupting, setInterrupting] = useState(false);
    const seenInterruptKey = useRef(interruptKey);
    const interruptingRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus();
      },
    }));

    // First contact: cut into the Nexus line, then switch to the Sentinel tab.
    useEffect(() => {
      if (interruptKey === seenInterruptKey.current) return;
      seenInterruptKey.current = interruptKey;
      interruptingRef.current = true;
      setInterrupting(true);
      const timer = setTimeout(() => {
        interruptingRef.current = false;
        setInterrupting(false);
        setTab('sentinel');
      }, INTERRUPT_MS);
      return () => {
        clearTimeout(timer);
      };
    }, [interruptKey]);

    // Reopening later (msg sentinel, another trigger) switches at once; the first
    // contact is handled by the interruption above.
    useEffect(() => {
      if (sentinelOpen && !interruptingRef.current) setTab('sentinel');
    }, [sentinelOpen]);

    // A new run clears the channel: back to the bare Nexus line.
    useEffect(() => {
      if (!sentinelEstablished) {
        interruptingRef.current = false;
        setInterrupting(false);
        setTab('nexus');
      }
    }, [sentinelEstablished]);

    const nexusText = interrupting
      ? '▒▒▒ signal lost ▒▒▒'
      : sentinelEstablished
        ? 'line quiet'
        : 'line open — no traffic';

    return (
      <div className="comms">
        {sentinelEstablished && (
          <div role="tablist" className="comms-tabs">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'nexus'}
              className="comms-tab"
              onClick={() => {
                setTab('nexus');
              }}>
              NEXUS
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'sentinel'}
              data-closed={!sentinelOpen}
              className={interrupting ? 'comms-tab comms-flicker' : 'comms-tab'}
              onClick={() => {
                setTab('sentinel');
              }}>
              SENTINEL
            </button>
          </div>
        )}
        {tab === 'nexus' || !sentinelEstablished ? (
          <div className="comms-nexus">
            <div className="comms-line">NEXUS // ENCRYPTED LINE</div>
            <div className="comms-empty">{nexusText}</div>
          </div>
        ) : (
          <div className="comms-channel">
            <TerminalOutput lines={sentinelLines} />
            {sentinelBusy && <div className="line line--dm">sentinel &gt;&gt; …</div>}
            {!sentinelOpen && (
              <div className="comms-empty">
                [channel closed — type msg sentinel in the terminal to reopen]
              </div>
            )}
            <TerminalInput
              ref={inputRef}
              onSubmit={onSend}
              disabled={!sentinelOpen}
              prompt="ghost >>"
              testId="comms-input"
              focusPolicy="always"
            />
          </div>
        )}
      </div>
    );
  },
);

CommsPane.displayName = 'CommsPane';
