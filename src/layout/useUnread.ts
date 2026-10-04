import { useEffect, useRef, useState } from 'react';

// Whether the COMMS pane holds traffic the player has not seen. `activity` is the running count of
// things that arrived (Nexus messages, replies). A resumed run starts read; a new run starts with
// its opening message unread; focusing COMMS reads everything.
export const useUnread = (
  activity: number,
  commsFocused: boolean,
  runKey: string | null,
  startsRead: boolean,
): boolean => {
  const [seen, setSeen] = useState(() => (startsRead ? activity : 0));
  const lastRun = useRef(runKey);

  useEffect(() => {
    if (lastRun.current === runKey) return;
    lastRun.current = runKey;
    setSeen(startsRead ? activity : 0);
  }, [runKey, startsRead, activity]);

  useEffect(() => {
    if (commsFocused) setSeen(activity);
  }, [commsFocused, activity]);

  return runKey !== null && activity > seen && !commsFocused;
};
