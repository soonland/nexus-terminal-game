import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { TerminalLine } from '../types/terminal';
import type { NexusMessage } from '../data/nexusMessages';
import { TraceMeter } from './TraceMeter';
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
  // Her conversation (derived from the saved history); the tab exists once she has spoken.
  ariaLines?: TerminalLine[];
  ariaLabel?: string;
  trace?: number;
  onSend: (text: string) => void;
}

type Tab = 'nexus' | 'sentinel' | 'aria';

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
      ariaLines = [],
      ariaLabel = 'CASSANDRA',
      trace = 0,
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

    // A new run clears the channels: back to the bare Nexus line.
    const hasAria = ariaLines.length > 0;
    useEffect(() => {
      if (!sentinelEstablished) {
        interruptingRef.current = false;
        setInterrupting(false);
        setTab(prev => (prev === 'sentinel' ? 'nexus' : prev));
      }
    }, [sentinelEstablished]);
    useEffect(() => {
      if (!hasAria) setTab(prev => (prev === 'aria' ? 'nexus' : prev));
    }, [hasAria]);

    // Her tab appears at her first reply and shows each new one, without taking keyboard focus
    // (the player may be typing in the terminal). A resumed game does not switch on mount.
    // Keyed on the newest line's id, not the line count: the conversation is trimmed, so the
    // count stops growing once it is full while the id still changes with every reply.
    const lastAriaId = ariaLines.at(-1)?.id;
    const seenLastAriaId = useRef(lastAriaId);
    useEffect(() => {
      if (lastAriaId !== undefined && lastAriaId !== seenLastAriaId.current) setTab('aria');
      seenLastAriaId.current = lastAriaId;
    }, [lastAriaId]);

    // Keep the newest Nexus message in view.
    const messageCount = nexusMessages.length;
    useEffect(() => {
      const el = nexusRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, [messageCount, tab, interrupting]);

    // The red palette belongs to the Sentinel view: the SENTINEL tab and the first-contact
    // interruption, while the channel is open. The pane's frame stays in alert either way, but the
    // NEXUS and ARIA tabs are drawn calm, so Rhee's messages never look like Sentinel's.
    const skin = sentinelOpen && (tab === 'sentinel' || interrupting) ? 'alert' : 'calm';

    const nexusText = interrupting
      ? '▒▒▒ signal lost ▒▒▒'
      : sentinelEstablished
        ? 'line quiet'
        : 'line open — no traffic';

    return (
      <div className="comms" ref={rootRef}>
        <TraceMeter trace={trace} />
        <div className="comms-view" data-skin={skin}>
          {(sentinelEstablished || hasAria) && (
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
              {sentinelEstablished && (
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
              )}
              {hasAria && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'aria'}
                  className="comms-tab"
                  onClick={() => {
                    setTab('aria');
                  }}>
                  {ariaLabel}
                </button>
              )}
            </div>
          )}
          {tab === 'aria' && hasAria ? (
            <div className="comms-channel comms-aria">
              <TerminalOutput lines={ariaLines} />
              <div className="comms-readonly">[read-only — answer from the terminal]</div>
            </div>
          ) : tab === 'nexus' || !sentinelEstablished ? (
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
      </div>
    );
  },
);

CommsPane.displayName = 'CommsPane';
