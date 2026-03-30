import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { TerminalLine } from '../types/terminal';
import { TerminalHeader } from './TerminalHeader';
import { TerminalOutput } from './TerminalOutput';
import { TerminalInput } from './TerminalInput';
import { SuggestionBar } from './SuggestionBar';

interface Props {
  lines: TerminalLine[];
  nodeIp: string;
  trace: number;
  suggestions: string[];
  onSubmit: (command: string) => void;
  inputDisabled?: boolean;
  inputPrompt?: string;
  inputMasked?: boolean;
  inputNoHistory?: boolean;
}

export interface TerminalHandle {
  focus: () => void;
}

export const Terminal = forwardRef<TerminalHandle, Props>(
  (
    {
      lines,
      nodeIp,
      trace,
      suggestions,
      onSubmit,
      inputDisabled = false,
      inputPrompt = 'nexus $',
      inputMasked = false,
      inputNoHistory = false,
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    return (
      <div
        onClick={() => inputRef.current?.focus()}
        style={{ display: 'flex', flexDirection: 'column', height: '100%', cursor: 'text' }}>
        <TerminalHeader nodeIp={nodeIp} trace={trace} />

        <TerminalOutput lines={lines} />

        <div style={{ flexShrink: 0 }}>
          <SuggestionBar
            suggestions={suggestions}
            onSelect={s => {
              if (inputRef.current) {
                inputRef.current.value = s;
                inputRef.current.focus();
              }
            }}
          />
          <TerminalInput
            ref={inputRef}
            onSubmit={onSubmit}
            disabled={inputDisabled}
            suggestions={suggestions}
            prompt={inputPrompt}
            masked={inputMasked}
            noHistory={inputNoHistory}
          />
        </div>
      </div>
    );
  },
);

Terminal.displayName = 'Terminal';
