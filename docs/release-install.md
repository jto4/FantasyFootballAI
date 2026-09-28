# Desktop release installation

This guide applies to published, signed Sunday Sidekick releases. Current desktop artifacts
are unsigned and are still in pre-release verification; do not bypass operating-system
publisher warnings to install an unsigned package. macOS ARM is the only package verified
locally, and Windows/Linux interactive installation has not yet been verified.

## Choose the package for your computer

Download the platform ZIP and `SHA256SUMS` from the same GitHub Release. Extract the ZIP and
follow the platform steps below. The ZIP contains this install guide, the MIT license, and the
native installer artifacts for that platform.

- **macOS:** Open the `.dmg` and drag Sunday Sidekick to Applications. Launch it from
  Applications. A signed and notarized release is required for the normal Gatekeeper flow.
- **Windows:** Run `Setup.exe` from the extracted package. The Squirrel installer installs
  the app for the current user.
- **Linux:** For Debian or Ubuntu, open the `.deb` package with the desktop package installer.
  Other Linux distributions are not yet verified.

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

## Updates and support status

The desktop app does not yet have an automatic update flow. Check the project's release notes
for upgrade instructions before replacing an existing installation. Keep a current in-app
backup before upgrading. The owner must publish signed packages and complete interactive
installation, upgrade, data-folder migration, background-service, and credential-storage checks
on each supported operating system before claiming full platform support.
