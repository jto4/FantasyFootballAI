import { useState } from 'react';

export function ReportSharing({
  title,
  body,
  disabled = false,
}: {
  title: string;
  body: string;
  disabled?: boolean;
}) {
  const [feedback, setFeedback] = useState<{
    text: string;
    message: string;
    manualCopy: boolean;
  }>();
  const text = `${title}\n\n${body}`;
  const message = feedback?.text === text ? feedback.message : '';
  const manualCopy = feedback?.text === text && feedback.manualCopy;
  const nativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback({
        text,
        message: 'Report copied. Paste it into your group chat.',
        manualCopy: false,
      });
    } catch {
      setFeedback({
        text,
        manualCopy: true,
        message: 'Select the text below and copy it. Your browser could not copy automatically.',
      });
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80) || 'sidekick-report'}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback({ text, message: 'Report downloaded as a text file.', manualCopy: false });
  }
  return (
    <section className="report-sharing" aria-label="Share report yourself">
      <h3>Share it yourself</h3>
      <p>
        Copy or download the reviewed text and post it wherever your league chats. No delivery setup
        is needed.
      </p>
      <div className="report-sharing-actions">
        <button
          type="button"
          className="small-button"
          disabled={disabled}
          onClick={() => void copy()}
        >
          Copy report
        </button>
        <button type="button" className="small-button" disabled={disabled} onClick={download}>
          Download report
        </button>
        {nativeShare && (
          <button
            type="button"
            className="small-button"
            disabled={disabled}
            onClick={async () => {
              try {
                await navigator.share({ title, text });
                setFeedback({
                  text,
                  message: 'Report handed to your device’s share menu.',
                  manualCopy: false,
                });
              } catch (error) {
                if (!(error instanceof Error && error.name === 'AbortError'))
                  setFeedback({
                    text,
                    message: 'Sharing is unavailable. Copy or download the report instead.',
                    manualCopy: false,
                  });
              }
            }}
          >
            Share report
          </button>
        )}
      </div>
      {disabled && <small>Save or cancel edits before sharing the saved report.</small>}
      {message && (
        <p role="status">{message} Sharing yourself does not mark this report as sent.</p>
      )}
      {manualCopy && !disabled && (
        <label>
          Report text to copy
          <textarea
            aria-label="Report text to copy"
            readOnly
            value={text}
            rows={8}
            onFocus={(event) => event.target.select()}
          />
        </label>
      )}
    </section>
  );
}
