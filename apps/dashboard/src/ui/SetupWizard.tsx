import type { ReactNode, RefObject } from 'react';
import { Dialog } from './Dialog';

export function SetupWizard({
  step,
  aiSetup,
  teamSetup,
  busy = false,
  closeButtonRef,
  onStepChange,
  onClose,
  onConnectLeague,
  onSetupAi,
  ready = true,
  generating = false,
  onGenerate,
  onPersonalize,
  onChooseDataDirectory,
  onSetupDelivery,
}: {
  step: number;
  aiSetup?: ReactNode;
  teamSetup?: ReactNode;
  busy?: boolean;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onStepChange: (step: number) => void;
  onClose: () => void;
  onConnectLeague: () => void;
  onSetupAi: () => void;
  ready?: boolean;
  generating?: boolean;
  onGenerate: () => void;
  onPersonalize: () => void;
  onChooseDataDirectory: () => void;
  onSetupDelivery: () => void;
}) {
  return (
    <Dialog
      titleId="setup-wizard-title"
      className="setup-wizard-modal"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <button
        disabled={busy}
        ref={closeButtonRef}
        type="button"
        className="modal-close"
        onClick={onClose}
        aria-label="Close guided setup"
      >
        ×
      </button>
      <p className="section-overline">STEP {step + 1} OF 3</p>
      <h2 id="setup-wizard-title">
        {step === 0
          ? 'Connect your league'
          : step === 1
            ? 'Connect your AI writer'
            : 'Create and review your first report'}
      </h2>
      <p className="setup-wizard-description">
        {step === 0
          ? 'Paste your league link. We’ll recognize Sleeper, ESPN, or Yahoo and help you with any private-league access.'
          : step === 1
            ? 'Connect the service that writes your reports. We’ll check that it works before you continue.'
            : 'Generate a report from your connected league, then review and edit it in Reports. This step never sends a message. Voice, schedules, delivery, and member memory are optional setup afterward.'}
      </p>
      <div className="setup-wizard-progress" aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map((progressStep) => (
          <span
            key={progressStep}
            className={progressStep <= step ? 'current' : ''}
            aria-hidden="true"
          />
        ))}
      </div>
      {step === 2 && ready && (
        <p className="connection-success" role="status">
          ✓ Your league and AI connection are ready.
        </p>
      )}
      {step === 1 && teamSetup}
      {step === 1 && aiSetup}
      <div className="setup-wizard-actions">
        <button
          type="button"
          className="small-button"
          onClick={() => onStepChange(Math.max(0, step - 1))}
          disabled={step === 0 || busy}
        >
          Back
        </button>
        {step === 0 ? (
          <button type="button" className="primary-button" onClick={onConnectLeague}>
            Connect a league <span aria-hidden="true">→</span>
          </button>
        ) : step === 1 && !aiSetup ? (
          <button type="button" className="primary-button" onClick={onSetupAi}>
            Set up AI <span aria-hidden="true">→</span>
          </button>
        ) : step === 2 ? (
          <button
            type="button"
            className="primary-button"
            disabled={!ready || generating}
            onClick={onGenerate}
          >
            {generating ? 'Generating…' : 'Create first report'} <span aria-hidden="true">→</span>
          </button>
        ) : null}
        {step === 2 && (
          <button type="button" className="small-button" onClick={onPersonalize}>
            Optional: personalize the voice
          </button>
        )}
        {step === 2 && window.sidekickDesktop && (
          <button type="button" className="small-button" onClick={onChooseDataDirectory}>
            Choose local data folder
          </button>
        )}
        {step === 2 && (
          <button type="button" className="small-button" onClick={onSetupDelivery}>
            Set up optional delivery providers
          </button>
        )}
      </div>
      <button type="button" className="setup-wizard-finish" disabled={busy} onClick={onClose}>
        Finish later
      </button>
    </Dialog>
  );
}
