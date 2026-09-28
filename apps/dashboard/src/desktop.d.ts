interface DesktopStartupSetting {
  supported: boolean;
  enabled: boolean;
}

interface DesktopDataDirectoryResult {
  changed: boolean;
}

interface Window {
  sidekickDesktop?: {
    getLaunchAtLogin(): Promise<DesktopStartupSetting>;
    setLaunchAtLogin(enabled: boolean): Promise<DesktopStartupSetting>;
    getStartHidden(): Promise<DesktopStartupSetting>;
    setStartHidden(enabled: boolean): Promise<DesktopStartupSetting>;
    getDataDirectory(): Promise<string>;
    chooseDataDirectory(): Promise<DesktopDataDirectoryResult>;
  };
}
