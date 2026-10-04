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
  };
}
