import { lazy } from 'react';

// Main pages load on demand to keep the startup bundle small, then prefetch while idle
// so later navigation does not wait on the network.
export const pageLoaders = {
  settings: () => import('./SettingsPage'),
  leagues: () => import('./LeaguesPage'),
  reports: () => import('./ReportsPage'),
  schedule: () => import('./SchedulePage'),
  memory: () => import('./MemoryPage'),
  advice: () => import('./AdvicePage'),
  live: () => import('./LivePage'),
  dynasty: () => import('./DynastyPage'),
  props: () => import('./PropsPage'),
  sunday: () => import('./SundayPage'),
  compare: () => import('./ComparePage'),
  trade: () => import('./TradePage'),
};
export const HelpPage = lazy(() =>
  import('./HelpPage').then((module) => ({ default: module.HelpPage })),
);
export const AdvicePage = lazy(() =>
  pageLoaders.advice().then((module) => ({ default: module.AdvicePage })),
);
export const SampleExperience = lazy(() =>
  import('./SampleExperience').then((module) => ({ default: module.SampleExperience })),
);
export const ScheduleEditor = lazy(() =>
  import('./ScheduleEditor').then((module) => ({ default: module.ScheduleEditor })),
);
export const SettingsPage = lazy(() =>
  pageLoaders.settings().then((module) => ({ default: module.SettingsPage })),
);
export const LeaguesPage = lazy(() =>
  pageLoaders.leagues().then((module) => ({ default: module.LeaguesPage })),
);
export const ReportsPage = lazy(() =>
  pageLoaders.reports().then((module) => ({ default: module.ReportsPage })),
);
export const SchedulePage = lazy(() =>
  pageLoaders.schedule().then((module) => ({ default: module.SchedulePage })),
);
export const MemoryPage = lazy(() =>
  pageLoaders.memory().then((module) => ({ default: module.MemoryPage })),
);
export const DeliveryTask = lazy(() =>
  import('./DeliveryTask').then((module) => ({ default: module.DeliveryTask })),
);

export const LivePage = lazy(() =>
  pageLoaders.live().then((module) => ({ default: module.LivePage })),
);

export const DynastyPage = lazy(() =>
  pageLoaders.dynasty().then((module) => ({ default: module.DynastyPage })),
);

export const PropsPage = lazy(() =>
  pageLoaders.props().then((module) => ({ default: module.PropsPage })),
);
export const SundayPage = lazy(() =>
  pageLoaders.sunday().then((module) => ({ default: module.SundayPage })),
);
export const ComparePage = lazy(() =>
  pageLoaders.compare().then((module) => ({ default: module.ComparePage })),
);
export const TradePage = lazy(() =>
  pageLoaders.trade().then((module) => ({ default: module.TradePage })),
);
