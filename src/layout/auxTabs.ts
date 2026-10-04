export type AuxTab = 'map' | 'case' | 'cam';

export const availableAuxTabs = (hasCam: boolean): readonly AuxTab[] =>
  hasCam ? ['map', 'case', 'cam'] : ['map', 'case'];

// A selected CAM tab with no feeds left (disconnected, moved on) shows the map instead.
export const resolveAuxTab = (tab: AuxTab, hasCam: boolean): AuxTab =>
  tab === 'cam' && !hasCam ? 'map' : tab;
