# Desktop release installation

This guide applies to published, signed Sunday Sidekick releases. Current desktop artifacts
are unsigned and are still in pre-release verification; do not bypass operating-system
publisher warnings to install an unsigned package. Apple Silicon is the only Mac package
verified locally; hosted Intel Mac packaging verification and Windows/Linux interactive
installation remain outstanding.

## Choose the package for your computer

Download the platform ZIP matching your operating system and architecture and `SHA256SUMS`
from the same GitHub Release. Extract the ZIP and
follow the platform steps below. The ZIP contains this install guide, the MIT license, and the
native installer artifacts for that platform.

- **macOS:** Download the ZIP matching your processor: ARM64 for Apple Silicon or x64 for
  Intel. Open its `.dmg` and drag Sunday Sidekick to Applications. Launch it from Applications.
  A signed and notarized release is required for the normal Gatekeeper flow.
- **Windows:** Run `Setup.exe` from the extracted package. The Squirrel installer installs
  the app for the current user.
- **Linux:** Choose the `.deb` package for Debian or Ubuntu, or the `.rpm` package for Fedora
  or RHEL-compatible distributions. Other Linux distributions are not yet verified.

The package checksum detects accidental corruption or incomplete downloads, but it does not
authenticate the publisher. Compare the selected ZIP against its entry in `SHA256SUMS` using
the platform's documented checksum utility. Do not treat a matching checksum from the same
release page as a publisher signature.

## First launch

The dashboard's guided setup connects a league and AI runtime, then lets you configure an
optional writing style, delivery provider, and (in the desktop app) local data folder. Choose
only integrations you intend to use. Scheduled reports start in review mode; each action's
automatic delivery setting is separate. League data stays in the app's local data folder, and
provider credentials use the operating system's credential manager.

In Settings, enable **Launch at sign-in** to start the app in the background when you sign in.
Closing the dashboard window hides the app to the system tray; choose **Quit Sunday Sidekick**
from the tray menu to stop scheduled work.

For scripted or headless desktop use, launch the packaged executable with
`--sidekick-headless`. This starts the local API and scheduled work without opening a dashboard
or tray icon. The service remains bound to loopback. Send SIGINT or SIGTERM to stop it cleanly
on macOS and Linux. A regular launch using the same user-data directory can open the dashboard
in the existing headless app process. This advanced mode is smoke-tested in the macOS package;
Windows and Linux device lifecycle verification remains outstanding.

## Check for updates

In the desktop app, open **Settings → Desktop updates** and choose **Check for updates**. The
check sends only the app version to GitHub. If a newer stable release exists, signed macOS and
Windows packages check Electron's public update feed and download the update in the background.
Sunday Sidekick asks before restarting to apply it; it never restarts automatically. If the
native updater is unavailable, **View version** opens the official release page for a manual
install. Linux updates use the distribution package or a manual release download.

The updater sends the app version, operating system, and architecture to Electron's update
service and downloads the matching public release asset. It does not send league, profile,
message, or credential data. macOS automatic updates require a signed app; tagged releases also
need the Squirrel.Windows `RELEASES`, full package, and installer assets. There is no public
stable signed release yet, so automatic updates cannot be verified end to end. Interactive
installation, upgrade, data-folder migration, background-service, and credential-storage checks
on each supported operating system are still required before claiming full platform support.
