import { useRef, useState } from 'react';

const MAX_HISTORY = 50;

export const useCommandHistory = () => {
  const history = useRef<string[]>([]);
  const [cursor, setCursor] = useState(-1);

  const push = (command: string) => {
    if (command.trim() && command !== history.current[0]) {
      history.current = [command, ...history.current].slice(0, MAX_HISTORY);
    }
    setCursor(-1);
  };

  const navigate = (direction: 'up' | 'down'): string => {
    const len = history.current.length;
    if (len === 0) return '';

    const next = direction === 'up' ? Math.min(cursor + 1, len - 1) : Math.max(cursor - 1, -1);

    setCursor(next);
    return next === -1 ? '' : (history.current[next] ?? '');
  };

  const reset = () => {
    setCursor(-1);
  };

  return { push, navigate, reset, cursor };
};
