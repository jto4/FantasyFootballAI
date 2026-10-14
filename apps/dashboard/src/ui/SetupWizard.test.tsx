import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SetupWizard } from './SetupWizard.js';

function renderStep(step: number) {
  return renderToStaticMarkup(
    createElement(SetupWizard, {
      step,
      closeButtonRef: createRef<HTMLButtonElement>(),
      onStepChange: vi.fn(),
      onClose: vi.fn(),
      onConnectLeague: vi.fn(),
      onSetupAi: vi.fn(),
      onPersonalize: vi.fn(),
      onGenerate: vi.fn(),
      onChooseDataDirectory: vi.fn(),
      onSetupDelivery: vi.fn(),
    }),
  );
}

describe('SetupWizard', () => {
  it('labels the league step and exposes an accessible dialog', () => {
    const markup = renderStep(0);

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-labelledby="setup-wizard-title"');
    expect(markup).toContain('STEP 1 OF 3');
    expect(markup).toContain('Connect a league');
    expect(markup).not.toContain('Set up optional delivery providers');
  });

  it('shows AI setup guidance on the second step', () => {
    const markup = renderStep(1);

    expect(markup).toContain('STEP 2 OF 3');
    expect(markup).toContain('Connect your AI writer');
    expect(markup).toContain('We’ll check that it works before you continue.');
    expect(markup).toContain('Set up AI');
  });
});
