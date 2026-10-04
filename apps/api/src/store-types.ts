import { type GenerationJob, type ScheduledRun } from '@sidekick/core';
import {
  type AppSettings,
  type LeagueConnection,
  type MemberMemory,
  type PlayerProjection,
  type SavedReport,
} from '@sidekick/core';
export interface AppState {
  settings: AppSettings;
  leagues: LeagueConnection[];
  reports: SavedReport[];
  memories: MemberMemory[];
  playerProjections: PlayerProjection[];
  scheduledRuns: ScheduledRun[];
  generationJobs?: GenerationJob[];
}

export type DashboardStateSnapshot = Omit<AppState, 'memories' | 'playerProjections'> & {
  memories: Array<
    Omit<MemberMemory, 'sourceText' | 'sourceAuthorId'> & {
      sourceLength: number;
      canMergeImportedConversation: boolean;
    }
  >;
};

export type { ScheduledRun, ScheduledLeagueResult } from '@sidekick/core';
