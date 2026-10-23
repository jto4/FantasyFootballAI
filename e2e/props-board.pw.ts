import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { seedAdvice } from './advice-fixture';

test('the props board compares lines with projections and hands a prop to bet analysis', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await seedAdvice(workspace.store);
    await page.goto(`${workspace.url}/#/advice?league=browser-league&mode=lineup`);
    await page
      .getByRole('navigation', { name: 'Advice workspace' })
      .getByRole('button', { name: 'Player props', exact: true })
      .click();
    const board = page.getByRole('region', { name: /Player props/ });
    const row = board.getByRole('row', { name: /Alex Quarterback/ });
    await expect(row).toContainText('Passing yards 265.5');
    await expect(row).toContainText('319.2 → 312.5');
    await expect(row).toContainText('Over 3 of 4');
    await expect(row).toContainText('54% over · fair 312.5');
    await expect(row).toContainText('Over · slight');
    await expect(board.getByLabel('Lean record')).toContainText('Lean record 0–0');
    await row.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Bet type', exact: true })).toHaveValue(
      'player-prop',
    );
    await expect(page.getByRole('combobox', { name: 'NFL game', exact: true })).toHaveValue(
      'upcoming',
    );
    await expect(page.getByLabel('Line', { exact: true })).toHaveValue('265.5');
    await expect(page.getByRole('checkbox', { name: /Alex Quarterback/ })).toBeChecked();
  } finally {
    await workspace.close();
  }
});
