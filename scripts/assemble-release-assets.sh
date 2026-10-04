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
archives_dir="$staging_dir/archives"
packages_dir="$staging_dir/packages"
updates_dir="$staging_dir/updates"
mkdir -p "$archives_dir" "$packages_dir" "$updates_dir"
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
      update_pattern=''
      ;;
    sunday-sidekick-macOS-ARM64)
      [[ "$macos_arm64_seen" == false ]] || { echo "Duplicate macOS ARM64 artifact." >&2; exit 1; }
      macos_arm64_seen=true
      installer_pattern='*.dmg'
      update_pattern='*-darwin-arm64-*.zip'
      ;;
    sunday-sidekick-macOS-X64)
      [[ "$macos_x64_seen" == false ]] || { echo "Duplicate macOS x64 artifact." >&2; exit 1; }
      macos_x64_seen=true
      installer_pattern='*.dmg'
      update_pattern='*-darwin-x64-*.zip'
      ;;
    sunday-sidekick-Windows-*)
      [[ "$windows_seen" == false ]] || { echo "Duplicate Windows artifact." >&2; exit 1; }
      windows_seen=true
      installer_pattern='*.exe'
      update_pattern=''
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
  if [[ -n "$(find "$artifact_dir" ! -type f ! -type d -print -quit)" ]]; then
    echo "Artifact contains a symlink or special file: $artifact_name" >&2
    exit 1
  fi
  if [[ "$artifact_name" == sunday-sidekick-Linux-* ]] &&
    [[ -z "$(find "$artifact_dir" -type f -iname '*.rpm' -print -quit)" ]]; then
    echo "Native installer (*.rpm) is missing from $artifact_name." >&2
    exit 1
  fi

  if [[ "$artifact_name" == sunday-sidekick-Windows-* ]]; then
    windows_manifests=()
    windows_packages=()
    windows_installers=()
    while IFS= read -r -d '' update_file; do windows_manifests+=("$update_file"); done < <(
      find "$artifact_dir" -type f -name 'RELEASES' -print0
    )
    while IFS= read -r -d '' update_file; do windows_packages+=("$update_file"); done < <(
      find "$artifact_dir" -type f -name '*-full.nupkg' -print0
    )
    while IFS= read -r -d '' update_file; do windows_installers+=("$update_file"); done < <(
      find "$artifact_dir" -type f -name '*.exe' -print0
    )
    if [[ ${#windows_manifests[@]} -ne 1 || ${#windows_packages[@]} -ne 1 || ${#windows_installers[@]} -ne 1 ]]; then
      echo "Windows update metadata, full package, or installer is missing or ambiguous in $artifact_name." >&2
      exit 1
    fi
    cp "${windows_manifests[0]}" "$updates_dir/RELEASES"
    cp "${windows_packages[0]}" "$updates_dir/"
    cp "${windows_installers[0]}" "$updates_dir/Sunday-Sidekick-win32-x64-Setup.exe"
  elif [[ -n "$update_pattern" ]]; then
    update_files=("$artifact_dir"/$update_pattern)
    if [[ ${#update_files[@]} -ne 1 || ! -f "${update_files[0]}" ]]; then
      echo "Architecture-specific macOS update ZIP is missing or ambiguous in $artifact_name." >&2
      exit 1
    fi
    cp "${update_files[0]}" "$updates_dir/"
  fi

  archive_name="${artifact_name}-${release_tag}.zip"
  package_dir="$packages_dir/$artifact_name"
  mkdir "$package_dir"
  cp -R "$artifact_dir/." "$package_dir/"
  cp "$repository_root/docs/release-install.md" "$package_dir/INSTALL.md"
  cp "$repository_root/LICENSE" "$package_dir/LICENSE"
  (
    cd "$package_dir"
    zip -qr "$archives_dir/$archive_name" . -x '.DS_Store' '*/.DS_Store'
  )
done

if [[ "$linux_seen" != true || "$macos_arm64_seen" != true || "$macos_x64_seen" != true || "$windows_seen" != true ]]; then
  echo "Release archives must include Linux, Windows, and both macOS architectures." >&2
  exit 1
fi

cp "$repository_root/docs/release-install.md" "$staging_dir/INSTALL.md"
cp "$repository_root/LICENSE" "$staging_dir/LICENSE"
if [[ -z "$(find "$updates_dir" -mindepth 1 -maxdepth 1 -type f -print -quit)" ]]; then
  echo "No supported auto-update assets were staged." >&2
  exit 1
fi
(
  cd "$updates_dir"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum ./* > "$staging_dir/UPDATE-SHA256SUMS"
    sha256sum --check "$staging_dir/UPDATE-SHA256SUMS"
  else
    shasum -a 256 ./* > "$staging_dir/UPDATE-SHA256SUMS"
    shasum -a 256 --check "$staging_dir/UPDATE-SHA256SUMS"
  fi
)
(
  cd "$archives_dir"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum ./*.zip > "$staging_dir/SHA256SUMS"
    sha256sum --check "$staging_dir/SHA256SUMS"
  else
    shasum -a 256 ./*.zip > "$staging_dir/SHA256SUMS"
    shasum -a 256 --check "$staging_dir/SHA256SUMS"
  fi
)

mv "$archives_dir"/*.zip "$updates_dir"/* "$staging_dir/INSTALL.md" "$staging_dir/LICENSE" \
  "$staging_dir/SHA256SUMS" "$staging_dir/UPDATE-SHA256SUMS" "$release_assets/"
rm -r "$packages_dir" "$archives_dir" "$updates_dir"
rmdir "$staging_dir"
staging_dir=''
