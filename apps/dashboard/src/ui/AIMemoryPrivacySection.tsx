import { ShieldCheck } from 'lucide-react';

type AIMemoryPrivacySectionProps = {
  memoryEnabled: boolean;
  analyzeImportsWithAI: boolean;
  includeMemberContextInReports: boolean;
  includeMemberContextInChatReplies: boolean;
  conversationRetentionDays?: 30 | 90 | 365 | undefined;
  onMemoryEnabledChange: (enabled: boolean) => void;
  onAnalyzeImportsChange: (enabled: boolean) => void;
  onIncludeMemberContextChange: (enabled: boolean) => void;
  onIncludeMemberContextInChatRepliesChange: (enabled: boolean) => void;
  onRetentionChange: (days: 30 | 90 | 365 | undefined) => void;
};

/** Keep the local-memory and AI-sharing controls together as one auditable privacy section. */
export function AIMemoryPrivacySection({
  memoryEnabled,
  analyzeImportsWithAI,
  includeMemberContextInReports,
  includeMemberContextInChatReplies,
  conversationRetentionDays,
  onMemoryEnabledChange,
  onAnalyzeImportsChange,
  onIncludeMemberContextChange,
  onIncludeMemberContextInChatRepliesChange,
  onRetentionChange,
}: AIMemoryPrivacySectionProps) {
  return (
    <section className="settings-card">
      <div className="settings-card-title">
        <div>
          <h2>AI privacy</h2>
          <p>
            Imported conversations and member profiles stay on this computer unless you enable their
            use with the selected AI runtime.
          </p>
        </div>
        <ShieldCheck size={18} />
      </div>
      <label className="switch-label">
        <input
          type="checkbox"
          checked={memoryEnabled}
          onChange={(event) => onMemoryEnabledChange(event.target.checked)}
        />
        Enable member memory
      </label>
      <small className="schedule-explainer">
        Turn this off to pause conversation imports, AI analysis, and use of member notes in
        reports. Existing profiles stay local until you delete them.
      </small>
      <label className="switch-label">
        <input
          type="checkbox"
          checked={analyzeImportsWithAI}
          disabled={!memoryEnabled}
          onChange={(event) => onAnalyzeImportsChange(event.target.checked)}
        />
        Analyze imported conversations with AI
      </label>
      <small className="schedule-explainer">
        When enabled, each member analysis sends up to 20,000 characters of that member’s messages
        and up to 20,000 characters of the original export as context to the configured AI runtime.
        The full untruncated export remains local.
      </small>
      <label className="switch-label">
        <input
          type="checkbox"
          checked={includeMemberContextInReports}
          disabled={!memoryEnabled}
          onChange={(event) => onIncludeMemberContextChange(event.target.checked)}
        />
        Include member notes in generated reports
      </label>
      <small className="schedule-explainer">
        When enabled, reviewed style and context notes from all imported member profiles are
        included with report prompts sent to the configured AI runtime.
      </small>
      <label className="switch-label">
        <input
          type="checkbox"
          checked={includeMemberContextInChatReplies}
          disabled={!memoryEnabled}
          onChange={(event) => onIncludeMemberContextInChatRepliesChange(event.target.checked)}
        />
        Include member notes in group-chat reply prompts
      </label>
      <small className="schedule-explainer">
        This is a separate opt-in from report sharing. When enabled, reviewed notes from profiles
        assigned to the selected league may be sent with SMS or iMessage mention replies. Profiles
        excluded from report prompts remain excluded here too.
      </small>
      <label>
        IMPORTED SOURCE RETENTION
        <select
          value={conversationRetentionDays ?? 'never'}
          onChange={(event) => {
            const value = event.target.value;
            onRetentionChange(value === 'never' ? undefined : (Number(value) as 30 | 90 | 365));
          }}
        >
          <option value="never">Keep until I delete it</option>
          <option value="30">Delete source text after 30 days</option>
          <option value="90">Delete source text after 90 days</option>
          <option value="365">Delete source text after 1 year</option>
        </select>
      </label>
      <small className="schedule-explainer">
        Expired original messages are removed locally; your editable member names, style notes,
        context notes, and banter preferences remain. Downloaded and pre-restore safety backups
        retain their own copies. Changes apply when you save Settings.
      </small>
    </section>
  );
}
