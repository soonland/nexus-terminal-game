import { useEffect, useState } from 'react';

// Below this width the tiled layout collapses to one pane at a time with a tab strip.
export const NARROW_WIDTH = 900;

export const useViewportWidth = (): number => {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => {
      setWidth(window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return width;
};
