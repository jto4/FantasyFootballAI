import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readBoundedJson } from '../packages/integrations/dist/index.js';

// Only Sleeper's published historical documentation sample is allowed here.
const sample = '289646328504385536';
const base = 'https://api.sleeper.app/v1';
async function read(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Public sample request failed (${response.status}).`);
  return readBoundedJson(response, 4000000);
}
const [rawLeague, rawRosters] = await Promise.all([
  read(`/league/${sample}`),
  read(`/league/${sample}/rosters`),
]);
if (
  !rawLeague ||
  typeof rawLeague !== 'object' ||
  !Array.isArray(rawRosters) ||
  rawRosters.length > 32
)
  throw new Error('Invalid public sample response.');
const numbers = (value) =>
  Object.fromEntries(
    Object.entries(value ?? {}).filter(
      ([, item]) => typeof item === 'number' && Number.isFinite(item),
    ),
  );
const ids = (value) =>
  Array.isArray(value)
    ? value.filter((id) => typeof id === 'string' && /^\d{1,20}$/.test(id)).slice(0, 100)
    : [];
const draftId = rawLeague.draft_id;
if (typeof draftId !== 'string' || !/^\d{1,20}$/.test(draftId))
  throw new Error('Invalid sample draft ID.');
const [rawDraft, rawPicks] = await Promise.all([
  read(`/draft/${draftId}`),
  read(`/draft/${draftId}/picks`),
]);
if (!Array.isArray(rawPicks) || rawPicks.length > 1000 || !rawDraft || typeof rawDraft !== 'object')
  throw new Error('Invalid sample draft.');
const fixture = {
  provenance: {
    capturedAt: new Date().toISOString(),
    documentation: 'https://docs.sleeper.com/#get-a-specific-league',
    source: `${base}/league/${sample}`,
    scope:
      'Historical public documentation sample. Owner IDs and names removed; manager labels synthesized. NFL player IDs and numeric league semantics retained. No current-season or private-account claim.',
  },
  league: {
    league_id: sample,
    name: 'Sanitized public sample',
    season: rawLeague.season,
    status: rawLeague.status,
    total_rosters: rawLeague.total_rosters,
    draft_id: draftId,
    roster_positions: rawLeague.roster_positions,
    scoring_settings: numbers(rawLeague.scoring_settings),
    settings: numbers(rawLeague.settings),
  },
  rosters: rawRosters.map((roster, index) => ({
    roster_id: roster.roster_id,
    owner_id: `anonymous-${index + 1}`,
    players: ids(roster.players),
    starters: ids(roster.starters),
    settings: numbers(roster.settings),
  })),
  users: rawRosters.map((_, index) => ({
    user_id: `anonymous-${index + 1}`,
    display_name: `Manager ${index + 1}`,
  })),
  draft: {
    league_id: sample,
    season: rawDraft.season,
    status: rawDraft.status,
    type: rawDraft.type,
    settings: numbers(rawDraft.settings),
  },
  picks: rawPicks.map((pick) => ({
    player_id: pick.player_id,
    roster_id: pick.roster_id,
    round: pick.round,
    pick_no: pick.pick_no,
    draft_slot: pick.draft_slot,
  })),
};
const directory = fileURLToPath(new URL('../packages/integrations/src/fixtures/', import.meta.url));
await mkdir(directory, { recursive: true });
await writeFile(`${directory}sleeper-public-sample.json`, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(
  JSON.stringify({
    capturedAt: fixture.provenance.capturedAt,
    teams: fixture.rosters.length,
    scoringFields: Object.keys(fixture.league.scoring_settings).length,
    draftPicks: fixture.picks.length,
    status: 'sanitized_fixture_saved',
  }),
);
