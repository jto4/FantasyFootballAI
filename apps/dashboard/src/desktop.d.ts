interface DesktopStartupSetting {
  supported: boolean;
  enabled: boolean;
}

interface DesktopDataDirectoryResult {
  changed: boolean;
}

interface DesktopUpdateCheckResult {
  status: 'available' | 'current' | 'unreleased' | 'error';
  currentVersion: string;
  latestVersion?: string;
  message?: string;
  nativeUpdateSupported?: boolean;
  nativeUpdate?: DesktopNativeUpdateState;
}

interface DesktopNativeUpdateState {
  state: 'idle' | 'unsupported' | 'checking' | 'current' | 'downloading' | 'downloaded' | 'error';
  percent?: number;
  message?: string;
}

interface Window {
  sidekickDesktop?: {
    isVerificationMode?(): boolean;
    getTheme?(): 'light' | 'dark' | 'system';
    getTeamSelections?(): Record<string, string>;
    setTeamSelections?(teams: Record<string, string>): Promise<Record<string, string>>;
    getNotificationHistory?(): Promise<
      { at: string; title: string; body: string; hash?: string }[]
    >;
    setTheme?(theme: 'light' | 'dark' | 'system'): Promise<'light' | 'dark' | 'system'>;
    getLaunchAtLogin(): Promise<DesktopStartupSetting>;
    setLaunchAtLogin(enabled: boolean): Promise<DesktopStartupSetting>;
    getStartHidden(): Promise<DesktopStartupSetting>;
    setStartHidden(enabled: boolean): Promise<DesktopStartupSetting>;
    getDataDirectory(): Promise<string>;
    chooseDataDirectory(): Promise<DesktopDataDirectoryResult>;
    checkForUpdates(): Promise<DesktopUpdateCheckResult>;
    getUpdateStatus(): Promise<DesktopNativeUpdateState>;
    installUpdate(): Promise<boolean>;
    onUpdateStatus(listener: (status: DesktopNativeUpdateState) => void): () => void;
    openReleasePage(): Promise<void>;
    leagueBrowser?: {
      open(url: string): Promise<boolean>;
      espnStatus(): Promise<{ signedIn: boolean }>;
      espnRead(league: { leagueId: string; season: number }): Promise<string>;
      espnSubmit(move: {
        leagueId: string;
        season: number;
        teamId: string;
        request: unknown;
      }): Promise<{ outcome: 'sent' | 'rejected' | 'signed-out' | 'uncertain'; reason?: string }>;
    };
  };
}
