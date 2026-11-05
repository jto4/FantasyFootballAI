import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  createLeagueBrowser,
  isLeaguePage,
  isLineupRequest,
  ownsEspnTeam,
} from './league-browser.mjs';

const request = {
  isLeagueManager: false,
  teamId: 10,
  scoringPeriodId: 9,
  executionType: 'EXECUTE',
  type: 'ROSTER',
  items: [{ playerId: 1, type: 'LINEUP', fromLineupSlotId: 20, toLineupSlotId: 4 }],
};
const member = '{ABC}';

function browser(respond, { signedIn = true, enabled = true } = {}) {
  const calls = [];
  const net = {
    request(options) {
      const emitter = new EventEmitter();
      let body = '';
      Object.assign(emitter, {
        setHeader() {},
        abort() {},
        write: (chunk) => (body += chunk),
        end() {
          calls.push({ ...options, body });
          let answer;
          try {
            answer = respond(options, body);
          } catch (error) {
            queueMicrotask(() => emitter.emit('error', error));
            return;
          }
          const response = new EventEmitter();
          response.statusCode = answer.status;
          queueMicrotask(() => {
            emitter.emit('response', response);
            response.emit('data', Buffer.from(answer.text ?? ''));
            response.emit('end');
          });
        },
      });
      return emitter;
    },
  };
  const session = {
    fromPartition: () => ({
      cookies: {
        get: async () => (signedIn ? [{ domain: '.espn.com', value: member }] : []),
      },
    }),
  };
  return {
    calls,
    client: createLeagueBrowser({ session, net, BrowserWindow: class {}, enabled: () => enabled }),
  };
}
const owned = { status: 200, text: JSON.stringify({ teams: [{ id: 10, owners: ['{abc}'] }] }) };
const input = { leagueId: '599669143', season: 2026, teamId: '10', request };

test('opens only known fantasy sites over https', () => {
  assert.equal(isLeaguePage('https://fantasy.espn.com/football/team'), true);
  assert.equal(isLeaguePage('http://fantasy.espn.com/'), false);
  assert.equal(isLeaguePage('https://fantasy.espn.com.evil.test/'), false);
  assert.equal(isLeaguePage('file:///etc/passwd'), false);
});

test('accepts only a lineup change for the named team', () => {
  assert.equal(isLineupRequest(request, '10'), true);
  assert.equal(isLineupRequest(request, '11'), false);
  assert.equal(isLineupRequest({ ...request, type: 'FREEAGENT' }, '10'), false);
  assert.equal(isLineupRequest({ ...request, memberId: 'x' }, '10'), false);
  assert.equal(isLineupRequest({ ...request, items: [] }, '10'), false);
  const drop = { ...request, items: [{ playerId: 1, type: 'DROP', fromTeamId: 10 }] };
  assert.equal(isLineupRequest(drop, '10'), false);
});

test('recognizes the owner regardless of case and refuses bad data', () => {
  assert.equal(ownsEspnTeam(owned.text, '10', member), true);
  assert.equal(ownsEspnTeam(owned.text, '11', member), false);
  assert.equal(ownsEspnTeam('not json', '10', member), false);
});

test('adds the member itself and sends once', async () => {
  const { client, calls } = browser((o) => (o.method === 'POST' ? { status: 200 } : owned));
  assert.deepEqual(await client.espnSubmit(input), { outcome: 'sent' });
  const post = calls.filter((call) => call.method === 'POST');
  assert.equal(post.length, 1);
  assert.equal(JSON.parse(post[0].body).memberId, member);
  assert.match(post[0].url, /^https:\/\/lm-api-writes\.fantasy\.espn\.com\//);
  assert.equal(post[0].useSessionCookies, true);
});

test('never sends for a team the login does not own', async () => {
  const { client, calls } = browser(() => ({
    status: 200,
    text: '{"teams":[{"id":10,"owners":[]}]}',
  }));
  assert.equal((await client.espnSubmit(input)).outcome, 'rejected');
  assert.equal(
    calls.some((call) => call.method === 'POST'),
    false,
  );
});

test('treats a dropped connection as unknown and does not retry', async () => {
  const { client, calls } = browser((o) => {
    if (o.method === 'POST') throw new Error('reset');
    return owned;
  });
  assert.deepEqual(await client.espnSubmit(input), { outcome: 'uncertain' });
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
});

test('reports a lost session, and does nothing in the verification profile', async () => {
  const signedOut = browser(() => owned, { signedIn: false });
  assert.deepEqual(await signedOut.client.espnSubmit(input), { outcome: 'signed-out' });
  const disabled = browser(() => owned, { enabled: false });
  assert.equal((await disabled.client.espnSubmit(input)).outcome, 'rejected');
  assert.equal(disabled.calls.length, 0);
  assert.deepEqual(await disabled.client.espnStatus(), { signedIn: false });
});
