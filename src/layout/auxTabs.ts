export type AuxTab = 'list' | 'case' | 'cam';

export const AUX_TAB_LABELS: Record<AuxTab, string> = {
  list: 'NETWORK LIST',
  case: 'CASE',
  cam: 'CAM',
};

export const availableAuxTabs = (hasCam: boolean): readonly AuxTab[] =>
  hasCam ? ['list', 'case', 'cam'] : ['list', 'case'];

// A selected CAM tab with no feeds left (disconnected, moved on) shows the network list instead.
export const resolveAuxTab = (tab: AuxTab, hasCam: boolean): AuxTab =>
  tab === 'cam' && !hasCam ? 'list' : tab;
