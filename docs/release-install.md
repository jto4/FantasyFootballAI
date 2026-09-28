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

## Check for updates

In the desktop app, open **Settings → Desktop updates** and choose **Check for updates**. The
check asks GitHub for the latest published stable release; it sends no league, profile, or
credential data. When an update is available, choose **View version** to open the official
release page in your browser, then download and install the package for your operating system
using the steps above. Back up local data before installing.

Downloads are installed manually; the app does not silently replace or restart itself. The
repository still needs a published signed release, and interactive installation, upgrade, data
folder migration, background-service, and credential-storage checks on each supported operating
system before claiming full platform support.
