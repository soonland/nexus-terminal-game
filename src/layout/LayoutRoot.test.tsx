// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutRoot } from './LayoutRoot';
import { createDefaultLayout, focusPane, toggleZoom, PANE_IDS } from './layoutTree';
import type { LayoutState, PaneId } from './layoutTree';

const mounts: Record<string, number> = {};

const Probe = ({ id }: { id: PaneId }) => {
  useEffect(() => {
    mounts[id] = (mounts[id] ?? 0) + 1;
  }, [id]);
  return <div>{`content-${id}`}</div>;
};

const panes = Object.fromEntries(PANE_IDS.map(id => [id, <Probe key={id} id={id} />])) as Record<
  PaneId,
  ReactNode
>;

const setup = (state: LayoutState, narrow = false) => {
  const onFocusPane = vi.fn();
  const onRatio = vi.fn();
  const view = render(
    <LayoutRoot
      state={state}
      panes={panes}
      narrow={narrow}
      onFocusPane={onFocusPane}
      onRatio={onRatio}
    />,
  );
  return { onFocusPane, onRatio, ...view };
};

const section = (id: PaneId) => document.querySelector<HTMLElement>(`[data-pane="${id}"]`)!;
const visible = () => PANE_IDS.filter(id => section(id).style.display !== 'none');

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of Object.keys(mounts)) mounts[k] = 0;
});

describe('LayoutRoot — tiled', () => {
  it('renders all five panes with numbered titles and one divider per split', () => {
    setup(createDefaultLayout());
    expect(visible()).toEqual([...PANE_IDS]);
    expect(screen.getByText('1:term')).toBeTruthy();
    expect(screen.getByText('5:comms')).toBeTruthy();
    expect(screen.getAllByRole('separator')).toHaveLength(PANE_IDS.length - 1);
  });

  it('positions panes from geometry using percentages', () => {
    setup(createDefaultLayout());
    const term = section('term');
    expect(term.style.left).toBe('0%');
    expect(term.style.top).toBe('0%');
    expect(parseFloat(term.style.width)).toBeCloseTo(62, 5);
  });

  it('marks the focused pane and focuses on pointer down', () => {
    const { onFocusPane } = setup(createDefaultLayout());
    expect(section('term').dataset.focused).toBe('true');
    expect(section('doc').dataset.focused).toBe('false');
    fireEvent.pointerDown(section('doc'));
    expect(onFocusPane).toHaveBeenCalledWith('doc');
  });

  it('renders header extras next to a pane title', () => {
    render(
      <LayoutRoot
        state={createDefaultLayout()}
        panes={panes}
        narrow={false}
        headerExtras={{ aux: <span>extra-aux</span> }}
        onFocusPane={vi.fn()}
        onRatio={vi.fn()}
      />,
    );
    expect(screen.getByText('extra-aux')).toBeTruthy();
  });
});

describe('LayoutRoot — bare', () => {
  it('marks the layout bare only when asked', () => {
    const { rerender } = setup(createDefaultLayout());
    expect(document.querySelector('.layout-bare')).toBeNull();
    rerender(
      <LayoutRoot
        state={createDefaultLayout()}
        panes={panes}
        narrow={false}
        bare
        onFocusPane={vi.fn()}
        onRatio={vi.fn()}
      />,
    );
    expect(document.querySelector('.layout-bare')).toBeTruthy();
  });
});

describe('LayoutRoot — zoom and narrow', () => {
  it('shows only the zoomed pane, full size, with no dividers', () => {
    setup(toggleZoom(focusPane(createDefaultLayout(), 'doc')));
    expect(visible()).toEqual(['doc']);
    expect(section('doc').style.width).toBe('100%');
    expect(section('doc').style.height).toBe('100%');
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
  });

  it('narrow mode shows only the focused pane and a tab strip', () => {
    const { onFocusPane } = setup(focusPane(createDefaultLayout(), 'files'), true);
    expect(visible()).toEqual(['files']);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(PANE_IDS.length);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.click(tabs[3]);
    expect(onFocusPane).toHaveBeenCalledWith('aux');
  });

  it('narrow mode shows the zoomed pane if one is set', () => {
    setup(toggleZoom(focusPane(createDefaultLayout(), 'comms')), true);
    expect(visible()).toEqual(['comms']);
  });

  it('does not render a tab strip in wide mode', () => {
    setup(createDefaultLayout());
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});

describe('LayoutRoot — panes stay mounted', () => {
  it('does not re-mount any pane on zoom, unzoom, focus change or narrow switch', () => {
    const base = createDefaultLayout();
    const { rerender } = setup(base);
    const renderWith = (state: LayoutState, narrow: boolean) => {
      rerender(
        <LayoutRoot
          state={state}
          panes={panes}
          narrow={narrow}
          onFocusPane={vi.fn()}
          onRatio={vi.fn()}
        />,
      );
    };
    renderWith(toggleZoom(base), false);
    renderWith(base, false);
    renderWith(focusPane(base, 'doc'), false);
    renderWith(base, true);
    renderWith(base, false);
    for (const id of PANE_IDS) expect(mounts[id]).toBe(1);
  });
});

describe('LayoutRoot — dividers', () => {
  const mockContainer = () =>
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 600,
      width: 1000,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

  it('dragging the root divider reports the ratio under the pointer', () => {
    mockContainer();
    const { onRatio } = setup(createDefaultLayout());
    const root = screen.getAllByRole('separator')[0];
    fireEvent.pointerDown(root, { clientX: 620, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 100 });
    expect(onRatio).toHaveBeenLastCalledWith([], 0.4);
    fireEvent.pointerUp(window);
    onRatio.mockClear();
    fireEvent.pointerMove(window, { clientX: 300, clientY: 100 });
    expect(onRatio).not.toHaveBeenCalled();
  });

  it('computes a nested divider ratio relative to its own parent rect', () => {
    mockContainer();
    const { onRatio } = setup(createDefaultLayout());
    // hunt: path ['a'] is a column split inside the left 62% (0..620px wide, full height).
    const nested = screen
      .getAllByRole('separator')
      .find(el => el.getAttribute('data-path') === 'a')!;
    fireEvent.pointerDown(nested, { clientX: 100, clientY: 432 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 300 });
    expect(onRatio).toHaveBeenLastCalledWith(['a'], 0.5);
  });

  it('arrow keys nudge by 0.02 in the right direction for each orientation', () => {
    const { onRatio } = setup(createDefaultLayout());
    const [rowDivider] = screen.getAllByRole('separator');
    fireEvent.keyDown(rowDivider, { key: 'ArrowLeft' });
    expect(onRatio).toHaveBeenLastCalledWith([], 0.62 - 0.02);
    fireEvent.keyDown(rowDivider, { key: 'ArrowRight' });
    expect(onRatio).toHaveBeenLastCalledWith([], 0.62 + 0.02);
    const colDivider = screen
      .getAllByRole('separator')
      .find(el => el.getAttribute('aria-orientation') === 'horizontal')!;
    fireEvent.keyDown(colDivider, { key: 'ArrowUp' });
    expect(onRatio.mock.calls.at(-1)![1]).toBeLessThan(0.72);
    fireEvent.keyDown(colDivider, { key: 'ArrowDown' });
    expect(onRatio.mock.calls.at(-1)![1]).toBeGreaterThan(0.5);
  });

  it('ignores unrelated keys on a divider', () => {
    const { onRatio } = setup(createDefaultLayout());
    fireEvent.keyDown(screen.getAllByRole('separator')[0], { key: 'a' });
    expect(onRatio).not.toHaveBeenCalled();
  });

  it('does nothing if the container has no size yet', () => {
    const { onRatio } = setup(createDefaultLayout());
    const root = screen.getAllByRole('separator')[0];
    fireEvent.pointerDown(root, { clientX: 620, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 100 });
    expect(onRatio).not.toHaveBeenCalled();
  });
});

describe('LayoutRoot — alerts', () => {
  it('flags only the panes that are in alert', () => {
    render(
      <LayoutRoot
        state={createDefaultLayout()}
        panes={panes}
        narrow={false}
        alerts={{ comms: true }}
        onFocusPane={vi.fn()}
        onRatio={vi.fn()}
      />,
    );
    expect(section('comms').dataset.alert).toBe('true');
    expect(section('term').dataset.alert).toBe('false');
    expect(section('doc').dataset.alert).toBe('false');
  });

  it('defaults to no alerts', () => {
    setup(createDefaultLayout());
    for (const id of PANE_IDS) expect(section(id).dataset.alert).toBe('false');
  });
});

describe('LayoutRoot — unread markers', () => {
  const withUnread = (unread: Partial<Record<PaneId, boolean>>, narrow = false) =>
    render(
      <LayoutRoot
        state={createDefaultLayout()}
        panes={panes}
        narrow={narrow}
        unread={unread}
        onFocusPane={vi.fn()}
        onRatio={vi.fn()}
      />,
    );

  it('marks the pane title of an unread pane', () => {
    withUnread({ comms: true });
    expect(section('comms').getAttribute('data-unread')).toBe('true');
    expect(section('comms').querySelector('.pane-title')?.textContent).toContain('●');
    expect(section('term').getAttribute('data-unread')).toBe('false');
    expect(section('term').querySelector('.pane-title')?.textContent).not.toContain('●');
  });

  it('shows no marker when nothing is unread', () => {
    withUnread({});
    expect(document.querySelectorAll('[data-unread="true"]')).toHaveLength(0);
  });

  it('marks the tab in the narrow one-pane-at-a-time view', () => {
    withUnread({ comms: true }, true);
    expect(screen.getByRole('tab', { name: /5:comms/ }).textContent).toContain('●');
    expect(screen.getByRole('tab', { name: /1:term/ }).textContent).not.toContain('●');
  });
});
