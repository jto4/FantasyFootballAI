import { useEffect, useState, type RefObject } from 'react';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';

type Props = {
  dataDirectoryHeadingRef: RefObject<HTMLHeadingElement | null>;
  onDataDirectoryLoaded: (path: string) => void;
  onNotice: (message: string) => void;
};

export function DesktopSettingsSections({
  dataDirectoryHeadingRef,
  onDataDirectoryLoaded,
  onNotice,
}: Props) {
  const [launchAtLogin, setLaunchAtLogin] = useState<DesktopStartupSetting | null>(null);
  const [launchAtLoginBusy, setLaunchAtLoginBusy] = useState(false);
  const [startHidden, setStartHidden] = useState<DesktopStartupSetting | null>(null);
  const [startHiddenBusy, setStartHiddenBusy] = useState(false);
  const [dataDirectory, setDataDirectory] = useState<string | null>(null);
  const [dataDirectoryBusy, setDataDirectoryBusy] = useState(false);
  const [desktopUpdate, setDesktopUpdate] = useState<DesktopUpdateCheckResult | null>(null);
  const [nativeUpdate, setNativeUpdate] = useState<DesktopNativeUpdateState | null>(null);
  const [desktopUpdateBusy, setDesktopUpdateBusy] = useState(false);
  const desktopAvailable = typeof window !== 'undefined' && Boolean(window.sidekickDesktop);

  useEffect(() => {
    const desktop = typeof window !== 'undefined' ? window.sidekickDesktop : undefined;
    if (!desktop) return;
    const unsubscribe = desktop.onUpdateStatus(setNativeUpdate);
    void desktop
      .getLaunchAtLogin()
      .then(setLaunchAtLogin)
      .catch(() => onNotice('Could not read the desktop startup setting.'));
    void desktop
      .getStartHidden()
      .then(setStartHidden)
      .catch(() => onNotice('Could not read the start-hidden setting.'));
    void desktop
      .getDataDirectory()
      .then((path) => {
        setDataDirectory(path);
        onDataDirectoryLoaded(path);
      })
      .catch(() => onNotice('Could not read the local data folder.'));
    void desktop
      .getUpdateStatus()
      .then(setNativeUpdate)
      .catch(() => undefined);
    return unsubscribe;
  }, [onDataDirectoryLoaded, onNotice]);

  async function changeLaunchAtLogin(enabled: boolean) {
    const desktop = window.sidekickDesktop;
    if (!desktop) return;
    setLaunchAtLoginBusy(true);
    try {
      const setting = await desktop.setLaunchAtLogin(enabled);
      setLaunchAtLogin(setting);
      if (!setting.supported) {
        onNotice('Automatic startup is not supported on this operating system.');
      } else if (setting.enabled !== enabled) {
        onNotice('The operating system did not enable startup. Check its login-item settings.');
      } else {
        onNotice(
          enabled ? 'Sunday Sidekick will open when you sign in.' : 'Launch at sign-in disabled.',
        );
      }
    } catch {
      onNotice('Could not change the launch-at-sign-in setting.');
    } finally {
      setLaunchAtLoginBusy(false);
    }
  }

  async function changeStartHidden(enabled: boolean) {
    const desktop = window.sidekickDesktop;
    if (!desktop) return;
    setStartHiddenBusy(true);
    try {
      const setting = await desktop.setStartHidden(enabled);
      setStartHidden(setting);
      onNotice(
        setting.supported
          ? enabled
            ? 'When launch at sign-in is enabled, Sunday Sidekick will start hidden at your next sign-in.'
            : 'Sunday Sidekick will open its dashboard at your next sign-in.'
          : 'Hidden startup is not supported on this operating system.',
      );
    } catch {
      onNotice('Could not change the start-hidden setting.');
    } finally {
      setStartHiddenBusy(false);
    }
  }

  async function changeDataDirectory() {
    const desktop = window.sidekickDesktop;
    if (!desktop || dataDirectoryBusy) return;
    setDataDirectoryBusy(true);
    onNotice('Choose a folder to copy your local data into…');
    try {
      const result = await desktop.chooseDataDirectory();
      onNotice(
        result.changed
          ? 'Data copied. Sunday Sidekick is restarting from the new folder…'
          : 'Local data folder unchanged.',
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not change the local data folder.');
    } finally {
      setDataDirectoryBusy(false);
    }
  }

  async function checkDesktopUpdates() {
    const desktop = window.sidekickDesktop;
    if (!desktop || desktopUpdateBusy) return;
    setDesktopUpdateBusy(true);
    setDesktopUpdate(null);
    try {
      const result = await desktop.checkForUpdates();
      setDesktopUpdate(result);
      if (result.nativeUpdate) setNativeUpdate(result.nativeUpdate);
    } catch {
      setDesktopUpdate({
        status: 'error',
        currentVersion: 'unknown',
        message: 'Could not check for updates. Try again when you have an internet connection.',
      });
    } finally {
      setDesktopUpdateBusy(false);
    }
  }

  async function installDesktopUpdate() {
    try {
      await window.sidekickDesktop?.installUpdate();
    } catch {
      onNotice('Could not restart to install the update.');
    }
  }

  async function openDesktopReleasePage() {
    try {
      await window.sidekickDesktop?.openReleasePage();
    } catch {
      onNotice('Could not open the official Sunday Sidekick releases page.');
    }
  }

  return (
    <>
      {launchAtLogin && (
        <section className="settings-card">
          <div className="settings-card-title">
            <div>
              <h2>Desktop startup</h2>
              <p>
                Run scheduled reports automatically by opening Sunday Sidekick when you sign in.
              </p>
            </div>
            <ShieldCheck size={18} />
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={launchAtLogin.enabled}
              disabled={!launchAtLogin.supported || launchAtLoginBusy || startHiddenBusy}
              onChange={(event) => void changeLaunchAtLogin(event.currentTarget.checked)}
            />
            <span>Launch at sign-in</span>
          </label>
          {startHidden && (
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={startHidden.enabled}
                disabled={!startHidden.supported || launchAtLoginBusy || startHiddenBusy}
                onChange={(event) => void changeStartHidden(event.currentTarget.checked)}
              />
              <span>Start hidden in the system tray</span>
            </label>
          )}
          <p className="schedule-explainer">
            This affects the next sign-in launch. Close the window to keep the app running in the
            tray.
          </p>
        </section>
      )}
      {desktopAvailable && (
        <section className="settings-card" aria-labelledby="desktop-updates-title">
          <div className="settings-card-title">
            <div>
              <h2 id="desktop-updates-title">Desktop updates</h2>
              <p>
                Check for stable releases. macOS and Windows packages can download updates in the
                app.
              </p>
            </div>
            <Download size={18} />
          </div>
          <div className="button-row">
            <button
              type="button"
              className="small-button"
              disabled={desktopUpdateBusy}
              onClick={() => void checkDesktopUpdates()}
            >
              <RefreshCw size={13} /> {desktopUpdateBusy ? 'Checking…' : 'Check for updates'}
            </button>
            {desktopUpdate?.status === 'available' && (
              <>
                <button
                  type="button"
                  className="small-button"
                  onClick={() => void openDesktopReleasePage()}
                >
                  <Download size={13} /> View version {desktopUpdate.latestVersion}
                </button>
                {nativeUpdate?.state === 'downloaded' && (
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => void installDesktopUpdate()}
                  >
                    Restart to install
                  </button>
                )}
              </>
            )}
          </div>
          {desktopUpdate && (
            <p role="status" className="schedule-explainer">
              {desktopUpdate.status === 'available'
                ? nativeUpdate?.state === 'checking'
                  ? `Version ${desktopUpdate.latestVersion} is available. Checking the signed update feed…`
                  : nativeUpdate?.state === 'downloading'
                    ? `Version ${desktopUpdate.latestVersion} is downloading${nativeUpdate.percent === undefined ? '…' : ` (${Math.round(nativeUpdate.percent)}%)`}`
                    : nativeUpdate?.state === 'downloaded'
                      ? `Version ${desktopUpdate.latestVersion} is ready. Choose Restart to install when convenient.`
                      : nativeUpdate?.state === 'error'
                        ? `${nativeUpdate.message} Version ${desktopUpdate.latestVersion} is available for manual installation.`
                        : `Version ${desktopUpdate.latestVersion} is available. You have ${desktopUpdate.currentVersion}. Use the official release page to download it if in-app updates are unavailable.`
                : desktopUpdate.status === 'current'
                  ? `You have the latest published version (${desktopUpdate.currentVersion}).`
                  : desktopUpdate.status === 'unreleased'
                    ? `You have version ${desktopUpdate.currentVersion}. No public release is available yet.`
                    : desktopUpdate.message}
            </p>
          )}
          <p className="schedule-explainer">
            In-app updates are supported by signed macOS and Windows releases. Linux updates use the
            distribution package or the manual release download. Your local data remains in its
            current data folder when the app updates.
          </p>
        </section>
      )}
      {dataDirectory !== null && (
        <section className="settings-card">
          <div className="settings-card-title">
            <div>
              <h2 ref={dataDirectoryHeadingRef} tabIndex={-1}>
                Local data folder
              </h2>
              <p>
                League data, reports, imported messages, and backups are stored here. Provider
                secrets stay in the operating system credential manager.
              </p>
            </div>
            <ShieldCheck size={18} />
          </div>
          <p className="schedule-explainer" aria-label="Current data folder">
            {dataDirectory}
          </p>
          <button
            type="button"
            className="small-button"
            onClick={() => void changeDataDirectory()}
            disabled={dataDirectoryBusy}
          >
            {dataDirectoryBusy ? 'Copying and restarting…' : 'Choose data folder'}
          </button>
          <small>
            Sunday Sidekick makes a consistent database copy and restarts to use the selected
            folder. The current folder is kept as a local copy; delete it yourself after confirming
            the new location works.
          </small>
        </section>
      )}
    </>
  );
}
