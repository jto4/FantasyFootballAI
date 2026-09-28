const releaseApiUrl = 'https://api.github.com/repos/jto4/FantasyFootballAI/releases/latest';
const maxReleaseMetadataBytes = 64 * 1024;
const updateCheckTimeoutMs = 5_000;

function parseVersion(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) return undefined;
  const parts = value.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : undefined;
}

function isNewerVersion(candidate, installed) {
  const candidateParts = parseVersion(candidate);
  const installedParts = parseVersion(installed);
  if (!candidateParts || !installedParts) return false;
  for (let index = 0; index < 3; index += 1) {
    if (candidateParts[index] !== installedParts[index])
      return candidateParts[index] > installedParts[index];
  }
  return false;
}

async function readBoundedJson(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxReleaseMetadataBytes)
    throw new Error('Release metadata is too large.');
  if (!response.body) throw new Error('Release metadata is unavailable.');

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxReleaseMetadataBytes) {
      await reader.cancel();
      throw new Error('Release metadata is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Query only the public release endpoint; no user, league, or credential data is sent. */
export async function checkForDesktopUpdate(
  currentVersion,
  fetchImpl = fetch,
  timeoutMs = updateCheckTimeoutMs,
) {
  if (!parseVersion(currentVersion))
    return { status: 'error', currentVersion, message: 'The installed version is unavailable.' };

  try {
    const response = await fetchImpl(releaseApiUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Sunday-Sidekick-Desktop',
        'X-GitHub-Api-Version': '2026-03-10',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) return { status: 'unreleased', currentVersion };
    if (!response.ok) throw new Error('Release service returned an error.');

    const release = await readBoundedJson(response);
    const latestVersion =
      typeof release?.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : undefined;
    if (
      typeof release?.draft !== 'boolean' ||
      release.draft ||
      release.prerelease !== false ||
      !parseVersion(latestVersion)
    )
      throw new Error('Latest release metadata is invalid.');

    if (isNewerVersion(latestVersion, currentVersion))
      return { status: 'available', currentVersion, latestVersion };
    return { status: 'current', currentVersion, latestVersion };
  } catch {
    return {
      status: 'error',
      currentVersion,
      message: 'Could not check for updates. Try again when you have an internet connection.',
    };
  }
}
