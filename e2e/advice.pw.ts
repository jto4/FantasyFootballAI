import { test, expect, type Page, type Locator } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { seedAdvice, rollingAdviceData, adviceCatalog, adviceAnswer } from './advice-fixture';

function runtimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
async function openNumbers(result: Locator) {
  await expect(result).toBeVisible();
  if (!(await result.locator('.result-numbers').evaluate((el: HTMLDetailsElement) => el.open)))
    await result.getByText('Numbers & comparisons', { exact: true }).click();
}
async function open(page: Page, url: string, mode: string) {
  await page.goto(`${url}/#/advice?league=browser-league&mode=${mode}`);
  await expect(page).toHaveTitle('Sunday Sidekick');
  await expect(page.getByRole('heading', { name: 'Advice', exact: true })).toBeVisible();
  await expect(page.getByText('Saved AI connection:', { exact: false })).toBeVisible();
}
for (const mode of ['lineup', 'betting'] as const)
  test(`${mode}: explanation units appear once after analysis and reopening saved advice`, async ({
    page,
  }, info) => {
    const workspace = await apiWorkspace();
    const errors = runtimeErrors(page);
    try {
      if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
      await seedAdvice(workspace.store);
      const beforeSettings = workspace.store.settingsSnapshot();
      const metricId = mode === 'lineup' ? 'lineup-optimized' : 'odds-break-even';
      const unit = mode === 'lineup' ? 'points' : '%';
      workspace.setAdviceAnswer((request) =>
        JSON.stringify({
          ...JSON.parse(adviceAnswer(request)),
          reasons: [
            {
              text: `The computed comparison is {{${metricId}}}${unit === '%' ? '' : ' '}${unit}.`,
              metricIds: [metricId],
              sourceIds: [],
            },
          ],
        }),
      );
      await open(page, workspace.url, mode);
      if (mode === 'betting') {
        await page
          .getByRole('combobox', { name: 'Bet type', exact: true })
          .selectOption('moneyline');
        await page
          .getByRole('combobox', { name: 'NFL game', exact: true })
          .selectOption('upcoming');
        await page.getByLabel('American odds', { exact: true }).fill('-110');
      }
      await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
      const result = page.getByRole('article', { name: 'Advice result' });
      await expect(result).toBeVisible();
      await openNumbers(result);
      const saved = workspace.store.snapshot().adviceResults![0]!;
      const metric = saved.metrics.find((row) => row.id === metricId)!;
      const expected = `The computed comparison is ${new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
      }).format(metric.value)} ${unit}.`;
      const explanation = result
        .getByRole('region', { name: 'Verdict' })
        .getByText(expected, { exact: true });
      await expect(explanation).toBeVisible();
      await explanation.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`${mode}-single-unit.png`) });
      await page.reload();
      await expect(explanation).toBeVisible();
      expect(workspace.adviceCalls).toHaveLength(2);
      expect(workspace.store.settingsSnapshot()).toEqual(beforeSettings);
      expect(workspace.credentialWrites).toHaveLength(0);
      expect(workspace.sends).toHaveLength(0);
      expect(errors).toEqual([]);
      expect(await result.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    } finally {
      await workspace.close();
    }
  });
test('a contextual bench choice displays its own estimate and comparison after save and reload', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(workspace.store);
    await workspace.store.update((state) => {
      state.leagues[0]!.teams[0]!.roster!.push({ ...adviceCatalog.get('w3')! });
      state.leagues[0]!.teams[0]!.rosterSize = 4;
    });
    workspace.setAdviceInjuries(
      ['q1', 'w1', 'r1', 'w3'].map((id) => {
        const player = adviceCatalog.get(id)!;
        return {
          season: 2026,
          week: 5,
          seasonType: 'REG' as const,
          gsisId: player.gsisId,
          team: player.nflTeam!,
          position: player.position!,
          fullName: player.name,
          reportStatus: id === 'w3' ? 'Questionable' : '',
          reportInjury: id === 'w3' ? 'Ankle' : '',
          practiceStatus: id === 'w3' ? 'Limited' : 'Full',
          practiceInjury: '',
          updatedAt: '2026-10-07T07:00:00Z',
        };
      }),
    );
    workspace.setAdviceAnswer((request) =>
      JSON.stringify({
        ...JSON.parse(adviceAnswer(request)),
        recommendedPlayerIds: ['q1', 'w1', 'r1'],
        reasons: [
          {
            text: 'Keep Blake Receiver at {{w1:projected}} over questionable Harper Receiver at {{w3:projected}} until availability is confirmed.',
            metricIds: ['w1:projected', 'w3:projected'],
            sourceIds: [],
          },
        ],
      }),
    );
    await open(page, workspace.url, 'lineup');
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    const selected = result.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supported starting lineup', exact: true }),
    });
    const comparison = result.locator('section').filter({
      has: page.getByRole('heading', { name: 'Highest estimate for comparison', exact: true }),
    });
    await expect(selected).toContainText('50 estimated weekly points');
    await expect(selected).toContainText('Blake Receiver');
    await expect(selected).toContainText('Quarterback: Alex Quarterback');
    await expect(selected).toContainText('Wide receiver: Blake Receiver');
    await expect(selected).toContainText('Running back: Casey Runner');
    await expect(selected).not.toContainText('WR 2');
    await expect(selected).not.toContainText('Harper Receiver');
    await openNumbers(result);
    await expect(comparison).toContainText('56 estimated weekly points');
    await expect(comparison).toContainText('Harper Receiver');
    await expect(result.getByRole('region', { name: 'Evidence confidence' })).toContainText(
      'Low evidence confidence',
    );
    await expect(result).toContainText('tradeoff has not been quantified');
    await selected.scrollIntoViewIfNeeded();
    expect(await result.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('contextual-lineup.png') });
    await page.reload();
    await expect(selected).toContainText('50 estimated weekly points');
    await openNumbers(result);
    await expect(comparison).toContainText('56 estimated weekly points');
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.sends).toHaveLength(0);
    expect(workspace.credentialWrites).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});
test('repeated starting positions use plain names and explicit slot numbers rather than player rankings', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(workspace.store);
    await workspace.store.update((state) => {
      const league = state.leagues[0]!;
      league.settings.roster_positions = ['QB', 'WR', 'WR', 'RB', 'BN'];
      league.teams[0]!.roster!.push({ ...adviceCatalog.get('w3')! });
      league.teams[0]!.rosterSize = 4;
    });
    await open(page, workspace.url, 'lineup');
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    const selected = result.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supported starting lineup', exact: true }),
    });
    await expect(selected).toContainText('72 estimated weekly points');
    const starters = selected.getByRole('listitem');
    await expect(starters).toHaveCount(4);
    await expect(starters.nth(0)).toContainText('Quarterback:');
    await expect(starters.nth(1)).toContainText('Wide receiver slot 1:');
    await expect(starters.nth(2)).toContainText('Wide receiver slot 2:');
    await expect(starters.nth(3)).toContainText('Running back:');
    await selected.scrollIntoViewIfNeeded();
    expect(await result.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('lineup-position-slots.png') });
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});
test('a current Out player leaves a complete replacement lineup available and saved', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(workspace.store);
    await workspace.store.update((state) => {
      state.leagues[0]!.teams[0]!.roster!.push({ ...adviceCatalog.get('w3')! });
      state.leagues[0]!.teams[0]!.rosterSize = 4;
    });
    workspace.setAdviceInjuries(
      ['q1', 'w1', 'r1', 'w3'].map((id) => {
        const player = adviceCatalog.get(id)!;
        return {
          season: 2026,
          week: 5,
          seasonType: 'REG' as const,
          gsisId: player.gsisId,
          team: player.nflTeam!,
          position: player.position!,
          fullName: player.name,
          reportStatus: id === 'w1' ? 'Out' : '',
          reportInjury: '',
          practiceStatus: 'Full',
          practiceInjury: '',
          updatedAt: '2026-10-07T07:00:00Z',
        };
      }),
    );
    await open(page, workspace.url, 'lineup');
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    const lineup = result.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supported starting lineup', exact: true }),
    });
    await expect(lineup).toContainText('56 estimated weekly points');
    await expect(lineup).toContainText('Harper Receiver');
    await expect(lineup).not.toContainText('Blake Receiver');
    expect(workspace.store.snapshot().adviceResults[0]!.assessment.verdict).toBe('lean');
    await lineup.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('replacement-lineup.png') });
    await page.reload();
    await expect(lineup).toContainText('56 estimated weekly points');
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.credentialWrites).toHaveLength(0);
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('injury update dates and practice limits stay visible after reopening saved advice', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(workspace.store);
    workspace.setAdviceInjuries([
      {
        season: 2026,
        week: 5,
        seasonType: 'REG',
        gsisId: 'gsis-w1',
        team: 'BUF',
        position: 'WR',
        fullName: 'Blake Receiver',
        reportStatus: 'Questionable',
        reportInjury: 'Ankle',
        practiceStatus: 'Limited Participation in Practice',
        practiceInjury: 'Ankle',
        updatedAt: '2026-10-07T07:00:00Z',
      },
    ]);
    await open(page, workspace.url, 'lineup');
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    const receiver = result
      .locator('.advice-player-evidence details')
      .filter({ has: page.locator('summary', { hasText: 'Blake Receiver' }) });
    await openNumbers(result);
    await receiver.locator('summary').click();
    const warning = receiver.getByText(/NFL injury report updated/);
    await expect(receiver).toContainText('Questionable');
    await expect(warning).toContainText('Limited Participation');
    await expect(warning).toContainText('does not guarantee playing');
    await warning.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('injury-report-context.png') });
    await page.reload();
    await openNumbers(result);
    await receiver.locator('summary').click();
    await expect(warning).toBeVisible();
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.credentialWrites).toHaveLength(0);
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await workspace.close();
  }
});
for (const mode of ['draft-plan', 'draft-review', 'lineup', 'trade', 'waivers'])
  test(`${mode}: computed advice, sources, saved result and reload`, async ({ page }, info) => {
    const workspace = await apiWorkspace();
    const errors = runtimeErrors(page);
    try {
      await seedAdvice(workspace.store);
      await open(page, workspace.url, mode);
      if (mode === 'trade') {
        await page.getByRole('checkbox', { name: /Blake Receiver/ }).check();
        await page.getByRole('checkbox', { name: /Ellis Receiver/ }).check();
      } else if (['draft-plan', 'waivers'].includes(mode)) {
        await page.getByRole('searchbox', { name: 'Players to compare (optional)' }).fill('Harper');
        await page.getByRole('checkbox', { name: /Harper Receiver/ }).check();
      }
      await page
        .getByLabel('Anything else to consider? (optional)')
        .fill('Keep the fictional choice conservative.');
      await page.screenshot({ path: info.outputPath(`${mode}-form.png`) });
      await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
      const result = page.getByRole('article', { name: 'Advice result' });
      await expect(result).toBeVisible();
      await expect(
        result.getByRole('heading', { name: 'Compare the fictional choices before acting' }),
      ).toBeInViewport();
      await page.screenshot({ path: info.outputPath(`${mode}-decision.png`) });
      await expect(page).toHaveURL(/result=[a-f0-9-]{36}/);
      await openNumbers(result);
      await expect(result).toContainText('Computed supporting evidence');
      await expect(
        result.getByRole('heading', { name: 'What could change the decision' }),
      ).toBeVisible();
      await expect(result.getByRole('region', { name: 'Evidence confidence' })).toContainText(
        '/100',
      );
      await result.getByText('Sources, model & usage', { exact: true }).click();
      await expect(result).toContainText('fixture-reasoning-model');
      await expect(result).toContainText('This provider did not report token usage');
      expect(workspace.adviceCalls).toHaveLength(2);
      expect(workspace.adviceCalls.every((call) => call.reasoningEffort === 'high')).toBe(true);
      expect(workspace.adviceCalls[0]!.prompt).toContain('Keep the fictional choice conservative.');
      expect(workspace.adviceCalls[0]!.prompt).not.toContain('original@example.test');
      expect(workspace.store.snapshot().adviceResults).toHaveLength(1);
      if (mode === 'waivers') {
        if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
        const coverage = result.getByRole('region', { name: 'Perception evidence coverage' });
        await expect(coverage).toContainText('2 relevant headlines in the past 7 days');
        await expect(coverage).toContainText('Current feed retrieval');
        await expect(coverage).toContainText('Matched Sleeper activity is available');
        await coverage.getByText('Headlines used in this analysis', { exact: true }).click();
        await expect(coverage).toContainText('Player mention: Harper Receiver');
        await expect(coverage).toContainText('Team context: BUF');
        await expect(coverage).toContainText('Published');
        await expect(coverage).not.toContainText('Kansas City');
        await coverage.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('waivers-perception-coverage.png') });
      }
      if (mode === 'lineup') {
        if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
        const receiver = result
          .locator('.advice-player-evidence details')
          .filter({ has: page.locator('summary', { hasText: 'Blake Receiver' }) });
        await openNumbers(result);
        await receiver.locator('summary').click();
        await expect(
          receiver.getByText('Home vs MIA · Oct 11, 2026', { exact: true }),
        ).toBeVisible();
        const share = receiver.getByRole('row', { name: /Share of recorded team targets/ });
        await expect(share).toContainText('50 %');
        await expect(share).toContainText('not snap share');
        await expect(
          receiver.getByRole('row', { name: /MIA versus WR: total receiving yards/ }),
        ).toContainText('190 yards/game');
        await expect(receiver).toContainText('Not an individual projection');
        await receiver
          .getByText('Home vs MIA · Oct 11, 2026', { exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('lineup-role-context.png') });
        await share.scrollIntoViewIfNeeded();
        if (info.project.name === 'mobile') {
          for (const cell of await share.getByRole('cell').all())
            expect((await cell.boundingBox())!.width).toBeGreaterThan(200);
          await expect(share.getByText('Source & sample:', { exact: true })).toBeVisible();
        }
        await page.screenshot({ path: info.outputPath('lineup-workload-share.png') });
      }
      if (mode === 'waivers')
        await expect(
          result.getByRole('region', { name: 'Perception evidence coverage' }),
        ).toContainText('2 relevant headlines');
      await page.screenshot({ path: info.outputPath(`${mode}-result.png`) });
      await page.reload();
      await expect(result).toBeVisible();
      await openNumbers(result);
      if (mode === 'waivers')
        await expect(
          result.getByRole('region', { name: 'Perception evidence coverage' }),
        ).toContainText('2 relevant headlines');
      if (mode === 'lineup') {
        const receiver = result
          .locator('.advice-player-evidence details')
          .filter({ has: page.locator('summary', { hasText: 'Blake Receiver' }) });
        await openNumbers(result);
        await receiver.locator('summary').click();
        await expect(receiver).toContainText('Home vs MIA');
        await expect(receiver).toContainText('Share of recorded team targets');
      }
      expect(workspace.adviceCalls).toHaveLength(2);
      expect(workspace.sends).toHaveLength(0);
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      await workspace.close();
    }
  });
for (const kind of ['spread', 'total', 'moneyline', 'player-prop'])
  test(`${kind}: sportsbook terms, historical evidence and separate AI forecast`, async ({
    page,
  }, info) => {
    const workspace = await apiWorkspace();
    const errors = runtimeErrors(page);
    try {
      if (info.project.name === 'mobile' && kind === 'player-prop')
        await page.setViewportSize({ width: 320, height: 568 });
      await seedAdvice(workspace.store);
      await open(page, workspace.url, 'betting');
      await page.getByRole('combobox', { name: 'Bet type', exact: true }).selectOption(kind);
      await page.getByRole('combobox', { name: 'NFL game', exact: true }).selectOption('upcoming');
      if (kind === 'spread') await page.getByLabel('Selected team’s handicap').fill('-3.5');
      if (kind === 'total') await page.getByLabel('Line', { exact: true }).fill('47.5');
      if (kind === 'player-prop') {
        await page.getByRole('searchbox', { name: 'Player for this prop' }).fill('Alex');
        await page.getByRole('checkbox', { name: /Alex Quarterback/ }).check();
        await page.getByLabel('Line', { exact: true }).fill('265.5');
      }
      await page.getByLabel('American odds', { exact: true }).fill('-110');
      await page.getByLabel('Opposite side’s odds (optional)').fill('-110');
      await page.screenshot({ path: info.outputPath(`${kind}-form.png`) });
      await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
      const result = page.getByRole('article', { name: 'Advice result' });
      await expect(result).toBeVisible();
      await openNumbers(result);
      await expect(result.getByRole('region', { name: 'AI betting forecast' })).toContainText(
        '60%',
      );
      await expect(result).toContainText('Uncalibrated AI judgment');
      await expect(result).toContainText('Break-even');
      const saved = workspace.store.snapshot().adviceResults![0]!;
      expect(saved.request.bet?.americanOdds).toBe(-110);
      expect(
        saved.betHistory!.wins + saved.betHistory!.losses + saved.betHistory!.pushes,
      ).toBeGreaterThan(0);
      if (kind === 'player-prop') expect(saved.request.bet?.playerId).toBe('gsis-q1');
      expect(saved.confidence.score).toBeLessThan(50);
      expect(saved.assessment.verdict).toBe('insufficient');
      expect(saved.assessment.recommendedPlayerIds).toEqual([]);
      expect(workspace.adviceCalls).toHaveLength(2);
      const coverage = result.getByRole('region', { name: 'Perception evidence coverage' });
      await expect(coverage).toContainText('1 relevant headline');
      await coverage.getByText('Headlines used in this analysis', { exact: true }).click();
      await expect(coverage).toContainText('Team context: BUF');
      await expect(coverage).not.toContainText('Harper Receiver');
      await expect(coverage).not.toContainText('Kansas City');
      await page.screenshot({ path: info.outputPath(`${kind}-result.png`) });
      expect(workspace.sends).toHaveLength(0);
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      await workspace.close();
    }
  });

test('rolling statistical forecast stays separate from AI judgment and persists with chronological evaluation', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(workspace.store);
    workspace.setAdviceFootballData(rollingAdviceData());
    await open(page, workspace.url, 'betting');
    await page.getByRole('combobox', { name: 'Bet type', exact: true }).selectOption('moneyline');
    await page.getByRole('combobox', { name: 'NFL game', exact: true }).selectOption('upcoming');
    await page.getByLabel('American odds', { exact: true }).fill('-110');
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' }),
      forecast = result.getByRole('region', { name: 'Rolling betting forecast' });
    await openNumbers(result);
    await expect(forecast).toContainText('experimental');
    await expect(forecast).toContainText('Evaluated chronologically');
    await expect(forecast).toContainText('separate from the AI');
    await expect(forecast.getByRole('status')).toContainText('does not support placing a bet');
    await expect(result.getByRole('region', { name: 'AI betting forecast' })).toContainText(
      'uncalibrated',
    );
    await forecast.getByRole('heading').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('rolling-bet-forecast.png') });
    const saved = workspace.store.snapshot().adviceResults![0]!;
    expect(saved.betHistory!.forecast!.evaluation.games).toBeGreaterThan(100);
    expect(saved.assessment.verdict).toBe('hold');
    expect(saved.metrics.some((metric) => metric.id === 'bet-model-brier')).toBe(true);
    await page.reload();
    await openNumbers(result);
    await expect(forecast).toBeVisible();
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.sends).toHaveLength(0);
    expect(workspace.credentialWrites).toHaveLength(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await workspace.close();
  }
});
test('stale headline coverage stays visibly unknown and saved evidence reopens without model calls', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(workspace.store);
    workspace.staleAdviceNews();
    await open(page, workspace.url, 'waivers');
    await page.getByRole('searchbox', { name: 'Players to compare (optional)' }).fill('Harper');
    await page.getByRole('checkbox', { name: /Harper Receiver/ }).check();
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    const coverage = result.getByRole('region', { name: 'Perception evidence coverage' });
    await openNumbers(result);
    await expect(coverage).toContainText('Stale feed retrieval');
    await expect(coverage).toContainText('Selected media tone: unknown');
    await expect(result).toContainText('cached headlines cannot establish current media tone');
    await coverage.getByText('Headlines used in this analysis', { exact: true }).click();
    await coverage.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('stale-perception-coverage.png') });
    await page.reload();
    await openNumbers(result);
    await expect(coverage).toContainText('Stale feed retrieval');
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.credentialWrites).toHaveLength(0);
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await workspace.close();
  }
});

test('deeper model selection reuses credentials and leaves report settings unchanged', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace(true, true, ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-image-1']);
  const errors = runtimeErrors(page);
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(workspace.store);
    await workspace.store.update((state) => {
      state.settings.aiRuntime!.baseUrl = 'https://api.openai.com/v1';
    });
    const settings = workspace.store.settingsSnapshot();
    await open(page, workspace.url, 'lineup');
    const choice = page.getByRole('combobox', { name: 'Model' });
    await expect(choice).toHaveValue('gpt-6-astra');
    await expect(choice.locator('option')).toHaveCount(3);
    await choice.selectOption('fixture-reasoning-model');
    await expect(choice).toHaveValue('fixture-reasoning-model');
    await choice.selectOption('gpt-6.1-sol');
    await page.getByText('Advanced analysis limits', { exact: true }).click();
    const limit = page.getByRole('combobox', { name: 'Reasoning and answer limit per pass' });
    await expect(limit).toHaveValue('16384');
    await limit.selectOption('8192');
    await expect(
      page.getByText('Your saved model’s prices do not apply', { exact: false }),
    ).toBeVisible();
    expect(workspace.adviceCalls).toHaveLength(0);
    await choice.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(choice).toBeInViewport();
    await page.screenshot({ path: info.outputPath('deeper-model-choice.png') });
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(result).toBeVisible();
    await openNumbers(result);
    await result.getByText('Sources, model & usage', { exact: true }).click();
    await expect(result).toContainText('gpt-6.1-sol');
    expect(workspace.store.snapshot().adviceResults![0]!.request.model).toBe('gpt-6.1-sol');
    expect(workspace.store.settingsSnapshot()).toEqual(settings);
    expect(workspace.credentialWrites).toEqual([]);
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.adviceCalls.every((call) => call.maxOutputTokens === 8192)).toBe(true);
    await page.reload();
    await expect(result).toBeVisible();
    await openNumbers(result);
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await workspace.close();
  }
});

test('an unavailable model stays selected until the user chooses a replacement', async ({
  page,
}, info) => {
  const available = ['gpt-6-astra', 'gpt-6.1-sol'];
  const workspace = await apiWorkspace(true, true, available);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(workspace.store);
    await workspace.store.update((state) => {
      state.settings.aiRuntime!.baseUrl = 'https://api.openai.com/v1';
    });
    await open(page, workspace.url, 'lineup');
    const choice = page.getByRole('combobox', { name: 'Model' });
    await choice.selectOption('gpt-6.1-sol');
    available.splice(available.indexOf('gpt-6.1-sol'), 1);
    const response = page.waitForResponse(
      (response) =>
        response.url().includes('/api/advice/') &&
        !response.url().endsWith('/readiness') &&
        // Home's background warm-up also POSTs under /api/advice/.
        !response.url().endsWith('/warm') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    expect((await response).status()).toBe(502);
    expect(workspace.adviceCalls).toHaveLength(0);
    await page.getByRole('button', { name: 'Reload choices', exact: true }).click();
    await expect(choice.locator('option:checked')).toContainText('No longer available');
    await expect(choice).toHaveValue('gpt-6.1-sol');
    await expect(
      page.getByRole('button', { name: 'Analyze my choices', exact: true }),
    ).toBeDisabled();
    await choice.selectOption('gpt-6-astra');
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Advice result' })).toBeVisible();
    expect(workspace.store.snapshot().adviceResults![0]!.model).toBe('gpt-6-astra');
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.credentialWrites).toEqual([]);
    expect(errors).toEqual([]);
    // The deliberate provider-access failure produces an expected network 502.
  } finally {
    await workspace.close();
  }
});

test('Home, search, Help, unsaved navigation and saved deletion are connected', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    await seedAdvice(workspace.store);
    await page.goto(workspace.url);
    await page.getByRole('button', { name: 'Advice', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Advice', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'How advice works' }).click();
    await expect(page.locator('#help-advice')).toContainText('no new key');
    await page.locator('#help-advice').getByRole('button', { name: 'Open Advice' }).click();
    await page.getByLabel('Anything else to consider? (optional)').fill('Unsaved football context');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Reports', exact: true }).click();
    await expect(page.getByLabel('Anything else to consider? (optional)')).toHaveValue(
      'Unsaved football context',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Reports', exact: true }).click();
    await page.keyboard.press('Control+k');
    const search = page.getByRole('dialog').getByRole('combobox');
    await search.fill('Set my lineup');
    await page.getByRole('option').filter({ hasText: 'Set my lineup' }).first().click();
    await expect(page).toHaveURL(/mode=lineup/);
    await expect(
      page.getByRole('button', { name: 'Analyze my choices', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Advice result' })).toBeVisible();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Delete saved advice', exact: true }).click();
    expect(workspace.store.snapshot().adviceResults).toHaveLength(1);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete saved advice', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Advice result' })).toHaveCount(0);
    await expect.poll(() => workspace.store.snapshot().adviceResults!.length).toBe(0);
    await page.screenshot({ path: info.outputPath('advice-navigation.png') });
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('canceling a delayed model discards late output and preserves the form', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors = runtimeErrors(page);
  try {
    await seedAdvice(workspace.store);
    await open(page, workspace.url, 'lineup');
    await page.getByLabel('Anything else to consider? (optional)').fill('Preserve this note');
    workspace.blockAdvice();
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    await expect.poll(() => workspace.adviceCalls.length).toBe(1);
    await expect(page.getByLabel('Anything else to consider? (optional)')).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel analysis' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Analysis canceled' })).toBeVisible();
    workspace.releaseAdvice();
    await expect(page.getByLabel('Anything else to consider? (optional)')).toHaveValue(
      'Preserve this note',
    );
    await expect(
      page.getByRole('button', { name: 'Analyze my choices', exact: true }),
    ).toBeEnabled();
    await page.screenshot({ path: info.outputPath('advice-canceled.png') });
    expect(workspace.store.snapshot().adviceResults).toHaveLength(0);
    expect(workspace.adviceCalls).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('unverified model output stays out of the UI and leaves a recoverable error', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await seedAdvice(workspace.store);
    await open(page, workspace.url, 'lineup');
    workspace.invalidAdvice();
    await page
      .getByLabel('Anything else to consider? (optional)')
      .fill('Keep my choices after failure');
    const response = page.waitForResponse(
      (response) =>
        response.url().includes('/api/advice/') &&
        !response.url().endsWith('/readiness') &&
        // Home's background warm-up also POSTs under /api/advice/.
        !response.url().endsWith('/warm') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    expect((await response).status()).toBe(502);
    await expect(page.locator('.advice-error')).toBeVisible();
    await expect(page.getByRole('article', { name: 'Advice result' })).toHaveCount(0);
    await expect(page.getByLabel('Anything else to consider? (optional)')).toHaveValue(
      'Keep my choices after failure',
    );
    await expect(page.getByRole('button', { name: 'Check saved advice' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('unverified model response');
    await page.screenshot({ path: info.outputPath('advice-verification-error.png') });
    expect(workspace.store.snapshot().adviceResults).toHaveLength(0);
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(errors).toEqual([]);
    // The expected 502 produces the browser's network error; no unverified content renders.
  } finally {
    await workspace.close();
  }
});
