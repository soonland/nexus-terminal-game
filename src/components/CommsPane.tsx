import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { TerminalLine } from '../types/terminal';
import type { NexusMessage } from '../data/nexusMessages';
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
  // The scripted Nexus line: every message received so far, oldest first.
  nexusMessages?: NexusMessage[];
  onSend: (text: string) => void;
}

type Tab = 'nexus' | 'sentinel';

// The line is cut about halfway, mid-sentence, as the channel is taken over.
const cutLine = (text: string): string =>
  `${text.slice(0, Math.max(8, Math.floor(text.length / 2))).trimEnd()} ▒▒▒ signal lost ▒▒▒`;

export const CommsPane = forwardRef<CommsHandle, Props>(
  (
    {
      sentinelEstablished,
      sentinelOpen,
      sentinelLines,
      sentinelBusy,
      interruptKey,
      nexusMessages = [],
      onSend,
    },
    ref,
  ) => {
    const [tab, setTab] = useState<Tab>('nexus');
    const [interrupting, setInterrupting] = useState(false);
    const seenInterruptKey = useRef(interruptKey);
    const interruptingRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const nexusRef = useRef<HTMLDivElement>(null);

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

    // The Sentinel input appears only once its tab shows (after the interruption). Take
    // focus then only if comms is still the focused pane: the player may have moved
    // back to the terminal while the Nexus line was being cut.
    useEffect(() => {
      if (tab !== 'sentinel') return;
      const pane = rootRef.current?.closest('[data-pane]');
      if (pane?.getAttribute('data-focused') === 'true') inputRef.current?.focus();
    }, [tab]);

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

    // Keep the newest Nexus message in view.
    const messageCount = nexusMessages.length;
    useEffect(() => {
      const el = nexusRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, [messageCount, tab, interrupting]);

    const nexusText = interrupting
      ? '▒▒▒ signal lost ▒▒▒'
      : sentinelEstablished
        ? 'line quiet'
        : 'line open — no traffic';

    return (
      <div className="comms" ref={rootRef}>
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
          <div className="comms-nexus" ref={nexusRef}>
            <div className="comms-line">NEXUS // ENCRYPTED LINE</div>
            {nexusMessages.length === 0 ? (
              <div className="comms-empty">{nexusText}</div>
            ) : (
              <>
                {nexusMessages.map((message, index) => {
                  const isLast = index === nexusMessages.length - 1;
                  // An interruption breaks the newest message off mid-sentence.
                  if (interrupting && isLast) {
                    return (
                      <div key={message.id} className="comms-msg">
                        <div className="comms-msg-line">{cutLine(message.lines[0] ?? '')}</div>
                      </div>
                    );
                  }
                  return (
                    <div key={message.id} className="comms-msg">
                      {message.lines.map(text => (
                        <div key={text} className="comms-msg-line">
                          {text}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {sentinelEstablished && !interrupting && (
                  <div className="comms-empty">line quiet</div>
                )}
              </>
            )}
            <div className="comms-readonly">[ENCRYPTED LINE — RECEIVE ONLY]</div>
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
              focusPolicy="if-idle"
            />
          </div>
        )}
      </div>
    );
  },
);

CommsPane.displayName = 'CommsPane';
