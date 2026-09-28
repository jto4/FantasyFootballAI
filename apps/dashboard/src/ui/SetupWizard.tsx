import type { RefObject } from 'react';

export function SetupWizard({
  step,
  closeButtonRef,
  onStepChange,
  onClose,
  onConnectLeague,
  onSetupAi,
  onPersonalize,
  onChooseDataDirectory,
  onSetupDelivery,
}: {
  step: number;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onStepChange: (step: number) => void;
  onClose: () => void;
  onConnectLeague: () => void;
  onSetupAi: () => void;
  onPersonalize: () => void;
  onChooseDataDirectory: () => void;
  onSetupDelivery: () => void;
}) {
  return (
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="setup-wizard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-wizard-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose();
            return;
          }
          if (event.key !== 'Tab') return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
          );
          const first = controls.item(0);
          const last = controls.item(controls.length - 1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <button
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
              ? 'Choose and test an AI runtime'
              : 'Set the voice and schedule'}
        </h2>
        <p className="setup-wizard-description">
          {step === 0
            ? 'Choose Sleeper, ESPN, or Yahoo and enter a league ID. Private leagues may need owner-authorized access first.'
            : step === 1
              ? 'Use an API key or a local CLI. Setup is complete after the selected runtime passes its data-free test.'
              : 'Choose a writing style, set boundaries, and decide when reports should be drafted or sent. Your league data stays in the local app data folder by default.'}
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
        <div className="setup-wizard-actions">
          <button
            type="button"
            className="small-button"
            onClick={() => onStepChange(Math.max(0, step - 1))}
            disabled={step === 0}
          >
            Back
          </button>
          {step === 0 ? (
            <button type="button" className="primary-button" onClick={onConnectLeague}>
              Connect a league <span>→</span>
            </button>
          ) : step === 1 ? (
            <button type="button" className="primary-button" onClick={onSetupAi}>
              Set up AI <span>→</span>
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={onPersonalize}>
              Personalize <span>→</span>
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
        <button type="button" className="setup-wizard-finish" onClick={onClose}>
          Finish later
        </button>
      </section>
    </div>
  );
}
