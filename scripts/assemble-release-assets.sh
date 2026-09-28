#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <downloaded-artifacts-dir> <empty-release-assets-dir> <version-tag>" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "$script_dir/.." && pwd)"
artifacts_root="$(cd "$1" && pwd)"
release_assets="$(mkdir -p "$2" && cd "$2" && pwd)"
release_tag="$3"

if [[ ! "$release_tag" =~ ^v[0-9]+([.][0-9]+){0,2}([-+][A-Za-z0-9.-]+)?$ ]]; then
  echo "Version tag must be a path-safe v-prefixed version." >&2
  exit 2
fi

for command_name in zip; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required release utility is unavailable: $command_name" >&2
    exit 2
  fi
done

if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  echo "Required SHA-256 utility is unavailable." >&2
  exit 2
fi

if [[ -n "$(find "$release_assets" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "Release assets directory must be empty: $release_assets" >&2
  exit 2
fi

staging_dir="$(mktemp -d "$release_assets/.assembly.XXXXXX")"
cleanup_staging() {
  if [[ -n "$staging_dir" && -d "$staging_dir" ]]; then
    rm -r "$staging_dir"
  fi
}
trap cleanup_staging EXIT

shopt -s nullglob
artifacts=("$artifacts_root"/sunday-sidekick-*)
if [[ ${#artifacts[@]} -ne 4 ]]; then
  echo "Expected packages from Linux, Windows, and both macOS architectures; found ${#artifacts[@]}." >&2
  exit 1
fi

linux_seen=false
macos_arm64_seen=false
macos_x64_seen=false
windows_seen=false
for artifact_dir in "${artifacts[@]}"; do
  if [[ ! -d "$artifact_dir" ]]; then
    echo "Downloaded artifact is not a directory: $artifact_dir" >&2
    exit 1
  fi

  artifact_name="${artifact_dir##*/}"
  case "$artifact_name" in
    sunday-sidekick-Linux-*)
      [[ "$linux_seen" == false ]] || { echo "Duplicate Linux artifact." >&2; exit 1; }
      linux_seen=true
      installer_pattern='*.deb'
      ;;
    sunday-sidekick-macOS-ARM64)
      [[ "$macos_arm64_seen" == false ]] || { echo "Duplicate macOS ARM64 artifact." >&2; exit 1; }
      macos_arm64_seen=true
      installer_pattern='*.dmg'
      ;;
    sunday-sidekick-macOS-X64)
      [[ "$macos_x64_seen" == false ]] || { echo "Duplicate macOS x64 artifact." >&2; exit 1; }
      macos_x64_seen=true
      installer_pattern='*.dmg'
      ;;
    sunday-sidekick-Windows-*)
      [[ "$windows_seen" == false ]] || { echo "Duplicate Windows artifact." >&2; exit 1; }
      windows_seen=true
      installer_pattern='*.exe'
      ;;
    *)
      echo "Unrecognized platform artifact: $artifact_name" >&2
      exit 1
      ;;
  esac

  if [[ -z "$(find "$artifact_dir" -type f -iname "$installer_pattern" -print -quit)" ]]; then
    echo "Native installer ($installer_pattern) is missing from $artifact_name." >&2
    exit 1
  fi
  if [[ "$artifact_name" == sunday-sidekick-Linux-* ]] &&
    [[ -z "$(find "$artifact_dir" -type f -iname '*.rpm' -print -quit)" ]]; then
    echo "Native installer (*.rpm) is missing from $artifact_name." >&2
    exit 1
  fi

  archive_name="${artifact_name}-${release_tag}.zip"
  cp "$repository_root/docs/release-install.md" "$artifact_dir/INSTALL.md"
  cp "$repository_root/LICENSE" "$artifact_dir/LICENSE"
  (
    cd "$artifact_dir"
    zip -qr "$staging_dir/$archive_name" . -x '.DS_Store' '*/.DS_Store'
  )
done

if [[ "$linux_seen" != true || "$macos_arm64_seen" != true || "$macos_x64_seen" != true || "$windows_seen" != true ]]; then
  echo "Release archives must include Linux, Windows, and both macOS architectures." >&2
  exit 1
fi

cp "$repository_root/docs/release-install.md" "$staging_dir/INSTALL.md"
cp "$repository_root/LICENSE" "$staging_dir/LICENSE"
(
  cd "$staging_dir"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum ./*.zip > SHA256SUMS
    sha256sum --check SHA256SUMS
  else
    shasum -a 256 ./*.zip > SHA256SUMS
    shasum -a 256 --check SHA256SUMS
  fi
)

mv "$staging_dir"/* "$release_assets/"
rmdir "$staging_dir"
staging_dir=''
