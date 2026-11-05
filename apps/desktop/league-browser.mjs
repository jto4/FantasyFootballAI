/**
 * A signed-in window for fantasy sites. The owner logs in here themself, and the session stays in
 * this Electron partition: cookies are never read into the API, dashboard, logs or backups.
 */
export const leaguePartition = 'persist:sidekick-leagues';

const pageHosts = new Set([
  'fantasy.espn.com',
  'www.espn.com',
  'sleeper.com',
  'football.fantasysports.yahoo.com',
]);
const espnRead = 'https://lm-api-reads.fantasy.espn.com';
const espnWrite = 'https://lm-api-writes.fantasy.espn.com';
const maximumResponseBytes = 8_000_000;

export function isLeaguePage(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && pageHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

const validLeague = ({ leagueId, season }) =>
  /^\d{1,12}$/.test(String(leagueId)) &&
  Number.isInteger(season) &&
  season >= 2000 &&
  season < 2100;

const leaguePath = ({ leagueId, season }) =>
  `/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`;

/** Limits what the dashboard can ask for to one team's lineup slots, and nothing else. */
export function isLineupRequest(request, teamId) {
  const keys = Object.keys(request ?? {})
    .sort()
    .join();
  return (
    keys === 'executionType,isLeagueManager,items,scoringPeriodId,teamId,type' &&
    request.isLeagueManager === false &&
    request.executionType === 'EXECUTE' &&
    request.type === 'ROSTER' &&
    String(request.teamId) === String(teamId) &&
    Number.isInteger(request.scoringPeriodId) &&
    Array.isArray(request.items) &&
    request.items.length > 0 &&
    request.items.length <= 20 &&
    request.items.every(
      (item) =>
        Object.keys(item).sort().join() === 'fromLineupSlotId,playerId,toLineupSlotId,type' &&
        item.type === 'LINEUP' &&
        Number.isSafeInteger(item.playerId) &&
        Number.isInteger(item.fromLineupSlotId) &&
        Number.isInteger(item.toLineupSlotId),
    )
  );
}

export function ownsEspnTeam(text, teamId, memberId) {
  try {
    const team = JSON.parse(text)?.teams?.find?.((row) => String(row?.id) === String(teamId));
    const member = String(memberId).toUpperCase();
    return (
      Array.isArray(team?.owners) &&
      team.owners.some((owner) => String(owner).toUpperCase() === member)
    );
  } catch {
    return false;
  }
}

export function createLeagueBrowser({ BrowserWindow, session, net, enabled = () => true }) {
  let window;
  const leagueSession = () => session.fromPartition(leaguePartition);

  async function memberId() {
    const cookies = await leagueSession().cookies.get({ name: 'SWID' });
    const espn = cookies.find((cookie) =>
      /(^|\.)espn\.com$/.test(cookie.domain.replace(/^\./, '')),
    );
    return espn?.value;
  }

  /** One bounded request with the window's cookies, which stay inside Electron's network stack. */
  function send(url, { method = 'GET', body } = {}) {
    return new Promise((resolve, reject) => {
      const request = net.request({
        url,
        method,
        session: leagueSession(),
        useSessionCookies: true,
        redirect: 'error',
      });
      const timer = setTimeout(() => {
        request.abort();
        reject(new Error('timeout'));
      }, 20_000);
      request.setHeader('x-fantasy-platform', 'espn-fantasy-web');
      request.setHeader('x-fantasy-source', 'kona');
      if (body) request.setHeader('content-type', 'application/json');
      request.on('response', (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > maximumResponseBytes) {
            clearTimeout(timer);
            request.abort();
            reject(new Error('too large'));
          } else chunks.push(chunk);
        });
        response.on('end', () => {
          clearTimeout(timer);
          resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') });
        });
      });
      request.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      if (body) request.write(body);
      request.end();
    });
  }

  return {
    open(url) {
      if (!enabled() || !isLeaguePage(url)) return false;
      if (window && !window.isDestroyed()) {
        void window.loadURL(url);
        window.show();
        window.focus();
        return true;
      }
      const leagues = leagueSession();
      leagues.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      // No preload: pages shown here get no route into the app.
      window = new BrowserWindow({
        width: 1280,
        height: 900,
        title: 'League site',
        webPreferences: {
          session: leagues,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      window.webContents.setWindowOpenHandler(({ url: next }) => {
        if (next.startsWith('https://')) void window.loadURL(next);
        return { action: 'deny' };
      });
      window.webContents.on('will-navigate', (event, next) => {
        if (!next.startsWith('https://')) event.preventDefault();
      });
      window.once('closed', () => {
        window = undefined;
      });
      void window.loadURL(url);
      return true;
    },

    async espnStatus() {
      return { signedIn: enabled() && Boolean(await memberId()) };
    },

    /** The full league as ESPN shows it, for the same import a saved snapshot uses. */
    async espnRead(league) {
      if (!enabled() || !validLeague(league)) throw new Error('Invalid league.');
      const views = ['mTeam', 'mSettings', 'mMatchupScore', 'mRoster', 'mDraftDetail'];
      const query = views.map((view) => `view=${view}`).join('&');
      const { status, text } = await send(`${espnRead}${leaguePath(league)}?${query}`);
      if (status !== 200) throw new Error('ESPN could not be read.');
      return text;
    },

    /** Sends once and never retries: no clear answer means ESPN may have applied it. */
    async espnSubmit({ leagueId, season, teamId, request }) {
      if (!enabled() || !validLeague({ leagueId, season }) || !isLineupRequest(request, teamId))
        return { outcome: 'rejected', reason: 'This change could not be sent.' };
      const member = await memberId();
      if (!member) return { outcome: 'signed-out' };
      let owners;
      try {
        owners = await send(`${espnRead}${leaguePath({ leagueId, season })}?view=mTeam`);
      } catch {
        return { outcome: 'rejected', reason: 'ESPN could not be read, so nothing was sent.' };
      }
      if (owners.status === 401 || owners.status === 403) return { outcome: 'signed-out' };
      if (!ownsEspnTeam(owners.text, teamId, member))
        return {
          outcome: 'rejected',
          reason: 'This ESPN login doesn’t own this team, so nothing was sent.',
        };
      try {
        const { status } = await send(
          `${espnWrite}${leaguePath({ leagueId, season })}/transactions/`,
          { method: 'POST', body: JSON.stringify({ ...request, memberId: member }) },
        );
        if (status >= 200 && status < 300) return { outcome: 'sent' };
        if (status === 401 || status === 403) return { outcome: 'signed-out' };
        return status >= 500 || status === 429 ? { outcome: 'uncertain' } : { outcome: 'rejected' };
      } catch {
        return { outcome: 'uncertain' };
      }
    },
  };
}
