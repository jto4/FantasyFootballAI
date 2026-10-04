import { describe, expect, it } from 'vitest';
import {
  defaultActionSettings,
  isAppSettings,
  isDeliveryEnvelope,
  isDraftEdit,
  isGenerationJob,
  isGenerationRequest,
  isLeagueConnection,
  isReportPage,
  isReportSendRequest,
  isSavedReport,
} from './index.js';
const settings = {
  writingStyle: 'League banter',
  reportLength: 'standard',
  allowProfanity: false,
  excludedTopics: '',
  memoryEnabled: true,
  analyzeImportsWithAI: false,
  includeMemberContextInReports: false,
  newsRefreshMinutes: 15,
  actions: structuredClone(defaultActionSettings),
};
const league = {
  id: 'league',
  platform: 'sleeper',
  name: 'Test',
  displayName: 'Test',
  teamCount: 1,
  teams: [{ id: '1', name: 'One', roster: [] }],
  scoring: {},
  settings: {},
  connectedAt: new Date().toISOString(),
};
const report = {
  id: 'report',
  leagueId: 'league',
  kind: 'power-rankings',
  createdAt: new Date().toISOString(),
  title: 'Rankings',
  body: 'Text',
  citations: [],
  status: 'draft',
};
describe('shared workflow contracts', () => {
  it('validates nested settings instead of accepting render-breaking collections', () => {
    expect(isAppSettings(settings)).toBe(true);
    for (const malformed of [
      { ...settings, newsSources: 'espn' },
      { ...settings, calendarEvents: 'events' },
      { ...settings, customWritingStylePresets: [{ name: 'voice', value: 17 }] },
      {
        ...settings,
        actions: [
          {
            ...settings.actions[0],
            schedule: { ...settings.actions[0]!.schedule, weekday: 'Tuesday' },
          },
        ],
      },
      { ...settings, sectionRevisions: { voice: '1' } },
    ])
      expect(isAppSettings(malformed)).toBe(false);
  });
  it('rejects malformed league and report details while accepting summaries', () => {
    expect(isLeagueConnection(league)).toBe(true);
    expect(
      isLeagueConnection({ ...league, teams: [{ ...league.teams[0], roster: 'players' }] }),
    ).toBe(false);
    expect(isLeagueConnection({ ...league, matchups: [{ week: 1, teams: 'broken' }] })).toBe(false);
    expect(isSavedReport(report)).toBe(true);
    expect(
      isSavedReport({ ...report, citations: [{ title: 'Bad', url: 'javascript:alert(1)' }] }),
    ).toBe(false);
    expect(
      isSavedReport({ ...report, aiUsage: { model: 'Test', inputTokens: '10', outputTokens: 10 } }),
    ).toBe(false);
    expect(isReportPage({ items: [report], total: 1 })).toBe(true);
    expect(isReportPage({ items: [{ id: 'report' }], total: 1 })).toBe(false);
  });
  it('bounds request IDs and validates terminal jobs and edits', () => {
    const request = { requestId: 'request-1234', leagueId: 'league', kind: 'power-rankings' };
    expect(isGenerationRequest(request)).toBe(true);
    expect(isGenerationRequest({ ...request, requestId: '../unsafe' })).toBe(false);
    expect(isGenerationRequest({ ...request, automaticDelivery: true })).toBe(false);
    expect(
      isGenerationJob({
        ...request,
        id: 'job',
        createdAt: new Date().toISOString(),
        status: 'completed',
      }),
    ).toBe(false);
    expect(isDraftEdit({ title: 'Title', body: 'Body', revision: 0 })).toBe(true);
    expect(isDraftEdit({ title: 'Title', body: 'Body', revision: '0' })).toBe(false);
    expect(isReportSendRequest({ retryUncertain: 'yes' })).toBe(false);
    expect(
      isReportSendRequest({
        revision: 0,
        expectedChannel: 'email',
        expectedDestination: 'owner@example.test',
      }),
    ).toBe(true);
  });
  it('keeps credentials out of durable delivery envelopes', () => {
    const envelope = {
      channel: 'email',
      destination: 'owner@example.test',
      sender: 'sender@example.test',
      subject: 'Rankings',
      body: 'Saved text',
      replyToId: '<thread@example.test>',
    };
    expect(isDeliveryEnvelope(envelope)).toBe(true);
    expect(isDeliveryEnvelope({ ...envelope, apiKey: 'private' })).toBe(false);
    expect(
      isDeliveryEnvelope({ ...envelope, sender: 'sender@example.test\nBcc: another@example.test' }),
    ).toBe(false);
  });
});
