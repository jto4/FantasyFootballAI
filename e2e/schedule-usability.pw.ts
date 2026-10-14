import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';

test('unsupported monthly search gives a Schedule next step and saves only an explicitly chosen cadence', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await workspace.store.update((state) => {
      state.settings.actions.find((action) => action.kind === 'power-rankings')!.schedule.enabled =
        true;
    });
    const before = workspace.store.settingsSnapshot();
    await page.goto(workspace.url);
    await expect(page).toHaveTitle('Sunday Sidekick');
    await page.getByRole('button', { name: 'Search the app' }).click();
    await page
      .getByRole('combobox', { name: 'Search settings, pages, leagues, and reports' })
      .fill('monthly rankings');
    await expect(page.getByRole('option', { name: /Task ·/ })).toHaveCount(0);
    const nextStep = page.getByRole('option', { name: /Open Schedule to choose monthly/ });
    await expect(nextStep).toBeVisible();
    await page.screenshot({ path: info.outputPath('monthly-search.png') });
    await nextStep.click();
    await expect(page.getByRole('heading', { name: 'Schedule', exact: true })).toBeVisible();
    expect(workspace.store.settingsSnapshot()).toEqual(before);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit power rankings schedule' }).click();
    const editor = page.getByRole('dialog', { name: 'Schedule power rankings' });
    await editor.getByRole('combobox', { name: 'FREQUENCY', exact: true }).selectOption('monthly');
    await editor.getByRole('combobox', { name: 'DAY OF MONTH', exact: true }).selectOption('7');
    await editor.getByRole('button', { name: 'Save schedule' }).click();
    await expect(editor).toBeHidden();
    const saved = workspace.store.settingsSnapshot();
    const action = saved.actions.find((action) => action.kind === 'power-rankings')!;
    expect(action.schedule.frequency).toBe('monthly');
    expect(action.schedule.dayOfMonth).toBe(7);
    expect(action.mode).toBe('draft');
    expect(saved.emailRecipient).toBe(before.emailRecipient);
    expect(workspace.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await workspace.close();
  }
});

test('delivery labels fit phones and friendly timezone names retain exact configured values', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await workspace.store.update((state) => {
      const action = state.settings.actions.find((action) => action.kind === 'power-rankings')!;
      action.schedule.enabled = true;
      action.schedule.timezone = 'Australia/Lord_Howe';
    });
    await page.goto(workspace.url + '/#/schedule');
    await page.getByRole('button', { name: 'Edit power rankings schedule' }).click();
    const editor = page.getByRole('dialog', { name: 'Schedule power rankings' });
    const policy = editor.getByRole('combobox', { name: 'Weekly power rankings delivery policy' });
    await expect(editor.getByText('Delivery channel', { exact: true })).toBeVisible();
    await expect(editor.getByText('Delivery policy', { exact: true })).toBeVisible();
    await expect(policy).toHaveValue('draft');
    if (info.project.name === 'mobile') {
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        expect(
          await policy.evaluate((el) => {
            const select = el as HTMLSelectElement;
            const style = getComputedStyle(select);
            const canvas = document.createElement('canvas').getContext('2d')!;
            canvas.font = style.font;
            return (
              select.clientWidth >= canvas.measureText(select.selectedOptions[0]!.text).width + 42
            );
          }),
        ).toBe(true);
        expect(await editor.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
    }
    await policy.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('delivery-layout.png') });
    const timezone = editor.getByRole('combobox', { name: 'TIMEZONE', exact: true });
    await expect(timezone).toHaveValue('Australia/Lord_Howe');
    await expect(
      timezone.getByRole('option', { name: 'Local time — Lord Howe', exact: true }),
    ).toHaveCount(1);
    await expect(
      editor.getByText('Timezone ID: Australia/Lord_Howe', { exact: true }),
    ).toBeVisible();
    await timezone.selectOption('America/New_York');
    await expect(
      timezone.getByRole('option', { name: 'Eastern Time — New York', exact: true }),
    ).toHaveCount(1);
    await expect(editor.locator('.schedule-summary')).toContainText('Eastern Time — New York');
    expect(
      await timezone.evaluate((el) => {
        const select = el as HTMLSelectElement;
        const style = getComputedStyle(select);
        const canvas = document.createElement('canvas').getContext('2d')!;
        canvas.font = style.font;
        return select.clientWidth >= canvas.measureText(select.selectedOptions[0]!.text).width + 42;
      }),
    ).toBe(true);
    await timezone.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('timezone-label.png') });
    // Save another field with the existing uncommon zone to prove display names do not rewrite IDs.
    await timezone.selectOption('Australia/Lord_Howe');
    await editor.getByRole('textbox', { name: 'TIME', exact: true }).fill('11:45');
    await editor.getByRole('button', { name: 'Save schedule' }).click();
    await expect(editor).toBeHidden();
    expect(
      workspace.store.settingsSnapshot().actions.find((action) => action.kind === 'power-rankings')!
        .schedule.timezone,
    ).toBe('Australia/Lord_Howe');
    await expect(
      page
        .locator('.schedule-card')
        .filter({ has: page.getByRole('heading', { name: 'Power rankings', exact: true }) }),
    ).toContainText('Local time — Lord Howe');
    expect(errors).toEqual([]);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});
