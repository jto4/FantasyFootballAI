import { useEffect, useRef, useState } from 'react';
import { Download, FileUp, Save, Trash2 } from 'lucide-react';
import type { MemberMemory } from '@sidekick/core';

type SavedMemory = Omit<MemberMemory, 'sourceText' | 'sourceAuthorId'> & {
  sourceLength: number;
  canMergeImportedConversation?: boolean;
};
type MemberProfileEdit = {
  name: string;
  styleNotes: string;
  contextNotes: string;
  banterPreference: string;
  avoidTopics: string;
  includeInReports: boolean;
  includeAllLeagues: boolean;
  leagueIds: string[];
};
type ProjectionSummary = {
  leagueId: string;
  sourceId: string;
  count: number;
  adpCount: number;
  scoringMatched?: boolean;
  sourceName: string;
  sourceUrl?: string;
  importedAt: string;
};
type ReceivedEmail = {
  id: string;
  from: string;
  subject: string;
  createdAt: string;
  imported: boolean;
};
type ImportParticipant = { name: string; messageCount: number };

export function MemoryPage({
  mode,
  leagues,
  memoryEnabled,
  analyzeImportsWithAI,
  imessageConfigured,
  twilioConfigured,
  resendConfigured,
  imessageChatGuid,
  smsRecipient,
  conversationRetentionDays,
}: {
  mode: 'members' | 'imports';
  leagues: { id: string; displayName: string }[];
  memoryEnabled: boolean;
  analyzeImportsWithAI: boolean;
  imessageConfigured: boolean;
  twilioConfigured: boolean;
  resendConfigured: boolean;
  imessageChatGuid?: string;
  smsRecipient?: string;
  conversationRetentionDays?: 30 | 90 | 365;
}) {
  const [profiles, setProfiles] = useState<SavedMemory[]>([]);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [importParticipants, setImportParticipants] = useState<ImportParticipant[]>([]);
  const [importProfileTargets, setImportProfileTargets] = useState<Record<string, string>>({});
  const [previewBusy, setPreviewBusy] = useState(false);
  const [projectionFile, setProjectionFile] = useState<File | null>(null);
  const [projectionLeagueId, setProjectionLeagueId] = useState(leagues[0]?.id ?? '');
  const [projectionSourceName, setProjectionSourceName] = useState('');
  const [projectionSourceUrl, setProjectionSourceUrl] = useState('');
  const [projectionScoringMatched, setProjectionScoringMatched] = useState(false);
  const [projectionSets, setProjectionSets] = useState<ProjectionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [edits, setEdits] = useState<Record<string, MemberProfileEdit>>({});
  const [receivedEmails, setReceivedEmails] = useState<ReceivedEmail[]>([]);
  const previewRequestId = useRef(0);

  async function refresh() {
    const response = await fetch('/api/state');
    const state = (await response.json()) as {
      memories?: (Omit<MemberMemory, 'sourceText' | 'sourceAuthorId'> & { sourceLength: number })[];
    };
    const memories = state.memories ?? [];
    setProfiles(memories);
    setEdits(
      Object.fromEntries(
        memories.map((profile) => [
          profile.id,
          {
            name: profile.name,
            styleNotes: profile.styleNotes,
            contextNotes: profile.contextNotes,
            banterPreference: profile.banterPreference ?? '',
            avoidTopics: profile.avoidTopics ?? '',
            includeInReports: profile.includeInReports !== false,
            includeAllLeagues: profile.leagueIds === undefined,
            leagueIds: profile.leagueIds ?? [],
          },
        ]),
      ),
    );
  }
  useEffect(() => {
    void refresh();
    if (mode === 'imports') void refreshProjectionSets();
  }, []);

  useEffect(() => {
    if (!leagues.some((league) => league.id === projectionLeagueId))
      setProjectionLeagueId(leagues[0]?.id ?? '');
  }, [leagues, projectionLeagueId]);

  async function refreshProjectionSets() {
    const response = await fetch('/api/projections');
    if (!response.ok) return;
    const summaries = (await response.json()) as ProjectionSummary[];
    setProjectionSets(summaries);
  }

  async function importFile(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setNotice('');
    try {
      if (file.size > 250_000) throw new Error('Export exceeds the 250 KB import limit.');
      const content = await file.text();
      if (content.length > 250_000) throw new Error('Export exceeds the 250 KB import limit.');
      const response = await fetch('/api/memory/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          sourceName: file.name,
          content,
          profileByAuthor: Object.fromEntries(
            Object.entries(importProfileTargets).filter(([, profileId]) => profileId),
          ),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        imported?: number;
        updated?: number;
        duplicates?: number;
        analysisFailures?: number;
      };
      if (!response.ok) throw new Error(result.error);
      setName('');
      setFile(null);
      setImportParticipants([]);
      setImportProfileTargets({});
      const parts = [
        `${result.imported ?? 0} new profile${result.imported === 1 ? '' : 's'}`,
        `${result.updated ?? 0} existing profile${result.updated === 1 ? '' : 's'} updated`,
        `${result.duplicates ?? 0} duplicate export${result.duplicates === 1 ? '' : 's'} skipped`,
      ];
      if (result.analysisFailures)
        parts.push(`AI analysis failed for ${result.analysisFailures} participant(s)`);
      setNotice(`${parts.join('; ')}. Review profile notes before using them in reports.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import file.');
    } finally {
      setBusy(false);
    }
  }

  async function previewConversation(selectedFile: File | null, fallbackName = name) {
    const requestId = ++previewRequestId.current;
    setFile(selectedFile);
    setImportParticipants([]);
    setImportProfileTargets({});
    if (!selectedFile) return;
    setPreviewBusy(true);
    setNotice('');
    try {
      if (selectedFile.size > 250_000) throw new Error('Export exceeds the 250 KB import limit.');
      const content = await selectedFile.text();
      const response = await fetch('/api/memory/import/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: fallbackName, content }),
      });
      const result = (await response.json()) as {
        error?: string;
        participants?: ImportParticipant[];
      };
      if (requestId !== previewRequestId.current) return;
      if (!response.ok) throw new Error(result.error ?? 'Could not preview the export.');
      const participants = result.participants ?? [];
      setImportParticipants(participants);
      setImportProfileTargets(Object.fromEntries(participants.map(({ name }) => [name, ''])));
    } catch (error) {
      if (requestId !== previewRequestId.current) return;
      setNotice(error instanceof Error ? error.message : 'Could not preview the export.');
    } finally {
      if (requestId === previewRequestId.current) setPreviewBusy(false);
    }
  }

  async function importProjections(event: React.FormEvent) {
    event.preventDefault();
    if (!projectionFile || !projectionLeagueId) return;
    const existing = projectionSets.find(
      (set) =>
        set.leagueId === projectionLeagueId &&
        set.sourceName.trim().toLowerCase() === projectionSourceName.trim().toLowerCase() &&
        (set.sourceUrl ?? '') === projectionSourceUrl.trim(),
    );
    if (
      existing &&
      !window.confirm(
        `Replace ${existing.count} projections from ${existing.sourceName} with the selected file? Other source sets will be kept.`,
      )
    )
      return;
    setBusy(true);
    setNotice('');
    try {
      if (projectionFile.size > 250_000)
        throw new Error('Projection CSV exceeds the 250 KB import limit.');
      const csv = await projectionFile.text();
      const response = await fetch('/api/projections/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          leagueId: projectionLeagueId,
          sourceName: projectionSourceName,
          sourceUrl: projectionSourceUrl,
          scoringMatched: projectionScoringMatched,
          csv,
        }),
      });
      const result = (await response.json()) as { error?: string; imported?: number };
      if (!response.ok) throw new Error(result.error ?? 'Could not import projections.');
      setProjectionFile(null);
      setProjectionSourceName('');
      setProjectionSourceUrl('');
      setProjectionScoringMatched(false);
      setNotice(`${result.imported ?? 0} player projections saved locally for this source.`);
      await refreshProjectionSets();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import projections.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteProjections(source: ProjectionSummary) {
    if (!window.confirm(`Delete ${source.count} projections from ${source.sourceName}?`)) return;
    const response = await fetch(
      `/api/projections/${encodeURIComponent(source.leagueId)}/source/${encodeURIComponent(source.sourceId)}`,
      {
        method: 'DELETE',
      },
    );
    if (!response.ok) {
      setNotice('Could not delete imported projections.');
      return;
    }
    setNotice('Imported projections deleted.');
    await refreshProjectionSets();
  }

  async function syncIMessages() {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/memory/imessage-sync', { method: 'POST' });
      const result = (await response.json()) as {
        error?: string;
        addedMessages?: number;
        profilesUpdated?: number;
        analysisFailures?: number;
        chatReplyDrafts?: number;
        chatRepliesSent?: number;
      };
      if (!response.ok) throw new Error(result.error ?? 'Could not sync iMessage history.');
      const analysis = result.analysisFailures
        ? ` AI analysis failed for ${result.analysisFailures} member profile(s); messages remain saved locally.`
        : analyzeImportsWithAI
          ? ' Member notes were updated by the selected AI runtime.'
          : ' Messages were saved locally without AI analysis.';
      setNotice(
        `${result.addedMessages ?? 0} new message(s) added for ${result.profilesUpdated ?? 0} member profile(s).${chatReplyResultText(result.chatReplyDrafts, result.chatRepliesSent)}${analysis} Review the profiles before using their notes in reports.`,
      );
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not sync iMessage history.');
    } finally {
      setBusy(false);
    }
  }

  async function syncTwilioConversation() {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/memory/twilio-conversation-sync', { method: 'POST' });
      const result = (await response.json()) as {
        error?: string;
        addedMessages?: number;
        profilesUpdated?: number;
        analysisFailures?: number;
        checkedMessages?: number;
        hasMore?: boolean;
        chatReplyDrafts?: number;
        chatRepliesSent?: number;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Could not sync Twilio Conversations history.');
      const analysis = result.analysisFailures
        ? ` AI analysis failed for ${result.analysisFailures} member profile(s); messages remain saved locally.`
        : analyzeImportsWithAI
          ? ' Member notes were updated by the selected AI runtime.'
          : ' Messages were saved locally without AI analysis.';
      setNotice(
        `Checked ${result.checkedMessages ?? 0} Twilio message(s); added ${result.addedMessages ?? 0} new message(s) for ${result.profilesUpdated ?? 0} member profile(s).${chatReplyResultText(result.chatReplyDrafts, result.chatRepliesSent)}${result.hasMore ? ' More history may be available; sync the next page to continue.' : ' Reached the current end of the available history.'}${analysis} Review the profiles before using their notes in reports.`,
      );
      await refresh();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Could not sync Twilio Conversations history.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadReceivedEmails() {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/email/received');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not read the Resend inbox.');
      setReceivedEmails(result as ReceivedEmail[]);
      setNotice('Resend inbox refreshed. Email bodies are fetched only when you choose Import.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not read the Resend inbox.');
    } finally {
      setBusy(false);
    }
  }

  async function importReceivedEmail(email: ReceivedEmail) {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(`/api/email/received/${encodeURIComponent(email.id)}/import`, {
        method: 'POST',
      });
      const result = (await response.json()) as { error?: string; duplicate?: boolean };
      if (!response.ok) throw new Error(result.error ?? 'Could not import received email.');
      setReceivedEmails((all) =>
        all.map((item) => (item.id === email.id ? { ...item, imported: true } : item)),
      );
      setNotice(
        result.duplicate
          ? 'This email was already imported.'
          : 'Email imported into local member memory. No reply was sent.',
      );
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import received email.');
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(id: string) {
    const fields = edits[id];
    if (!fields) return;
    const response = await fetch(`/api/memory/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...fields,
        leagueIds: fields.includeAllLeagues ? null : fields.leagueIds,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setNotice(result.error ?? 'Could not save profile.');
      return;
    }
    setNotice('Member profile saved locally.');
    await refresh();
  }

  function clearLearnedNotes(id: string) {
    const fields = edits[id];
    if (!fields) return;
    setEdits((all) => ({
      ...all,
      [id]: { ...fields, styleNotes: '', contextNotes: '' },
    }));
    setNotice(
      'Style and league context notes cleared in the editor. Save notes to apply the change; source messages and banter preferences are unchanged.',
    );
  }

  async function deleteProfile(id: string) {
    const response = await fetch(`/api/memory/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) {
      setNotice('Could not delete profile.');
      return;
    }
    setNotice('Imported source and member profile deleted.');
    await refresh();
  }

  async function deleteAllProfiles() {
    if (
      !window.confirm(
        'Delete every member profile and its imported source messages? This cannot be undone.',
      )
    )
      return;
    const response = await fetch('/api/memory', { method: 'DELETE' });
    if (!response.ok) {
      setNotice('Could not delete member memory.');
      return;
    }
    setNotice('All member profiles and imported source messages were deleted.');
    await refresh();
  }

  return (
    <div className="memory-page">
      <div className="page-title-block">
        <div>
          <p className="section-overline">LOCAL CONTEXT</p>
          <h1>{mode === 'imports' ? 'Conversation imports' : 'Members & memory'}</h1>
          <p>Imported archives and editable profiles stay on this computer.</p>
        </div>
        {mode === 'members' && (
          <div className="profile-buttons">
            <a className="small-button" href="/api/memory/export">
              <Download size={14} /> Export memory
            </a>
            <button
              className="small-button danger"
              onClick={() => void deleteAllProfiles()}
              disabled={profiles.length === 0}
            >
              <Trash2 size={14} /> Delete all memory
            </button>
          </div>
        )}
      </div>
      {!memoryEnabled && (
        <p className="memory-notice">
          Member memory is disabled. Conversation imports and member-context AI use are paused.
          Projection CSV imports remain separate; re-enable memory in Settings to resume
          conversation imports.
        </p>
      )}
      {mode === 'imports' && (
        <section className="settings-card import-form">
          <div className="settings-card-title">
            <div>
              <h2>Import player projections</h2>
              <p>
                Bring a projection CSV you are authorized to use. Importing the same source name and
                URL replaces that source set; other source sets remain available for comparison. Up
                to eight sources are stored per league. Data stays local until a draft review or
                supported matchup preview uses it. ADP medians require at least three source sets
                with an unambiguous player match, and remain descriptive estimates.
              </p>
            </div>
            <FileUp size={18} />
          </div>
          <p className="memory-notice">
            CSV columns: <code>player</code>, <code>projectedPoints</code>, and optional{' '}
            <code>playerId</code>, <code>position</code>, <code>nflTeam</code>, <code>week</code>,
            and <code>adp</code> (average overall draft position). Leave <code>week</code> blank for
            season totals; set it to 1–30 for a weekly estimate. Reports can cite the source URL you
            provide. Weekly matchup totals require platform starter IDs and a projection for every
            starter.
          </p>
          <form onSubmit={importProjections}>
            <div className="settings-fields two">
              <label>
                LEAGUE
                <select
                  required
                  value={projectionLeagueId}
                  onChange={(event) => setProjectionLeagueId(event.target.value)}
                  disabled={!leagues.length}
                >
                  {leagues.map((league) => (
                    <option key={league.id} value={league.id}>
                      {league.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                PROJECTION SOURCE
                <input
                  required
                  maxLength={100}
                  value={projectionSourceName}
                  onChange={(event) => setProjectionSourceName(event.target.value)}
                  placeholder="Source or provider name"
                />
              </label>
              <label>
                SOURCE URL (OPTIONAL)
                <input
                  type="url"
                  value={projectionSourceUrl}
                  onChange={(event) => setProjectionSourceUrl(event.target.value)}
                  placeholder="https://example.com/projections"
                />
              </label>
              <label>
                PROJECTION CSV
                <input
                  required
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setProjectionFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className="settings-fields">
              <label className="profile-optout scoring-confirmation">
                <input
                  type="checkbox"
                  checked={projectionScoringMatched}
                  onChange={(event) => setProjectionScoringMatched(event.target.checked)}
                />
                These projected points match this league’s scoring settings
                <small>
                  Check only when the source uses the league’s scoring format. Unconfirmed values
                  stay local and won’t be used for matchup totals or draft value analysis.
                </small>
              </label>
            </div>
            <button
              className="primary-button"
              type="submit"
              disabled={busy || !leagues.length || !projectionFile || !projectionSourceName.trim()}
            >
              {busy ? 'Importing…' : 'Import projections'} <span>→</span>
            </button>
          </form>
          {projectionSets
            .filter((set) => set.leagueId === projectionLeagueId)
            .map((set) => (
              <div className="memory-help" key={set.sourceId}>
                <strong>
                  {set.count} projections{set.adpCount ? ` · ${set.adpCount} with ADP` : ''} ·{' '}
                  {set.sourceName} ·{' '}
                  {set.scoringMatched === true ? 'scoring confirmed' : 'scoring unconfirmed'}
                </strong>
                <span> Imported {new Date(set.importedAt).toLocaleString()}.</span>
                {set.sourceUrl && (
                  <a href={set.sourceUrl} target="_blank" rel="noreferrer">
                    {' '}
                    Source ↗
                  </a>
                )}
                <button
                  className="small-button danger"
                  type="button"
                  onClick={() => void deleteProjections(set)}
                >
                  <Trash2 size={13} /> Delete source
                </button>
              </div>
            ))}
        </section>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice('')}>×</button>
        </div>
      )}
      {mode === 'imports' && memoryEnabled && (
        <>
          {resendConfigured && (
            <section className="settings-card import-form">
              <div className="settings-card-title">
                <div>
                  <h2>Import from Resend inbox</h2>
                  <p>
                    Refresh to view up to 50 recent inbound emails. Import a message to add the
                    sender’s unquoted text to their local member profile.
                  </p>
                </div>
                <FileUp size={18} />
              </div>
              <p className="memory-notice">
                Inbox metadata is fetched when you click Refresh; the body is fetched only when you
                click Import. Attachments are not imported. Email content stays local unless
                “Analyze imported conversations with AI” is enabled. This never sends an automatic
                reply, and the sender is not used as an outgoing recipient.
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={() => void loadReceivedEmails()}
                disabled={busy}
              >
                {busy ? 'Refreshing…' : 'Refresh Resend inbox'} <span>→</span>
              </button>
              {receivedEmails.map((email) => (
                <div className="memory-help" key={email.id}>
                  <strong>{email.subject || '(no subject)'}</strong>
                  <span>
                    {' '}
                    · {email.from} · {new Date(email.createdAt).toLocaleString()}
                  </span>
                  <button
                    className="small-button"
                    type="button"
                    disabled={busy || email.imported}
                    onClick={() => void importReceivedEmail(email)}
                  >
                    {email.imported ? 'Already imported' : 'Import to memory'}
                  </button>
                </div>
              ))}
            </section>
          )}
          {imessageConfigured && imessageChatGuid && (
            <section className="settings-card import-form">
              <div className="settings-card-title">
                <div>
                  <h2>Sync the configured iMessage group</h2>
                  <p>
                    Fetch up to 200 recent messages from the selected BlueBubbles chat. Sync runs
                    only when you click this button. Previously seen message IDs are skipped.
                  </p>
                </div>
                <FileUp size={18} />
              </div>
              <p className="memory-notice">
                {analyzeImportsWithAI
                  ? 'AI analysis is enabled. New participant messages and recent group context are sent to your selected AI runtime to update profile notes.'
                  : 'AI analysis is off. New messages stay local until you separately enable analysis, report context, or group-chat reply context.'}
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={() => void syncIMessages()}
                disabled={busy}
              >
                {busy ? 'Syncing…' : 'Sync messages now'} <span>→</span>
              </button>
            </section>
          )}
          {twilioConfigured && /^CH[0-9a-fA-F]{32}$/.test(smsRecipient ?? '') && (
            <section className="settings-card import-form">
              <div className="settings-card-title">
                <div>
                  <h2>Sync the configured Twilio group</h2>
                  <p>
                    Import the next page of up to 100 text messages from the existing Twilio
                    Conversations group. Sync runs only when you click. Media attachments are not
                    downloaded, and previously imported message IDs are skipped.
                  </p>
                </div>
                <FileUp size={18} />
              </div>
              <p className="memory-notice">
                {analyzeImportsWithAI
                  ? 'AI analysis is enabled. New participant messages and recent group context are sent to your selected AI runtime to update profile notes.'
                  : 'AI analysis is off. New messages stay local until you separately enable analysis, report context, or group-chat reply context.'}
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={() => void syncTwilioConversation()}
                disabled={busy}
              >
                {busy ? 'Syncing…' : 'Sync next page'} <span>→</span>
              </button>
            </section>
          )}
          <form className="settings-card import-form" onSubmit={importFile}>
            <div className="settings-card-title">
              <div>
                <h2>Import a conversation export</h2>
                <p>
                  Supports text, email, JSON, and CSV up to 250 KB. Preview identifies each author;
                  choose an existing import-created profile to merge their new messages and refresh
                  their notes, or create a separate profile. Imports are deduplicated when the same
                  file is selected again. Import only archives you are authorized to use.
                </p>
              </div>
              <FileUp size={18} />
            </div>
            <p className="memory-notice">
              {analyzeImportsWithAI
                ? `AI analysis is enabled. For each member, up to 20,000 characters of their messages and up to 20,000 characters of the original export are sent to the configured AI runtime; when you merge into a profile, its existing style and context notes are included to update them. The full export remains local${conversationRetentionDays ? ` until the ${conversationRetentionDays}-day retention period expires` : ''}.`
                : `AI analysis is off. The export and messages stay local; imported profiles start with blank AI notes for you to edit${conversationRetentionDays ? `. Original source text is purged after ${conversationRetentionDays} days` : ''}.`}
            </p>
            <p className="memory-help">
              BlueBubbles chat-message JSON responses are supported. Enter your own display name as
              the fallback name; other participants are initially identified by their phone number
              or email address and can be renamed after import.
            </p>
            <div className="settings-fields two">
              <label>
                FALLBACK NAME (PLAIN TEXT)
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (file) {
                      setImportParticipants([]);
                      setImportProfileTargets({});
                    }
                  }}
                  placeholder="Used when authors are not labeled"
                />
              </label>
              <label>
                EXPORT FILE
                <input
                  required
                  type="file"
                  accept=".txt,.eml,.json,.csv,.md"
                  onChange={(event) => void previewConversation(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {file && !previewBusy && !importParticipants.length && (
              <button
                className="small-button"
                type="button"
                onClick={() => void previewConversation(file)}
              >
                Preview export participants
              </button>
            )}
            {previewBusy && <p className="memory-help">Reading participants locally…</p>}
            {importParticipants.map((participant) => (
              <label className="profile-import-target" key={participant.name}>
                MERGE {participant.name.toUpperCase()} · {participant.messageCount} MESSAGES
                <select
                  value={importProfileTargets[participant.name] ?? ''}
                  onChange={(event) =>
                    setImportProfileTargets((current) => ({
                      ...current,
                      [participant.name]: event.target.value,
                    }))
                  }
                >
                  <option value="">Create a separate profile</option>
                  {profiles
                    .filter((profile) => profile.canMergeImportedConversation)
                    .map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} · {profile.sourceName}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <button
              className="primary-button"
              type="submit"
              disabled={busy || previewBusy || !file || !importParticipants.length}
            >
              {busy
                ? 'Importing…'
                : analyzeImportsWithAI
                  ? 'Import and analyze style'
                  : 'Import locally'}{' '}
              <span>→</span>
            </button>
          </form>
        </>
      )}
      {mode === 'imports' && !memoryEnabled && (
        <p className="memory-notice">
          Enable member memory in Settings before importing conversations.
        </p>
      )}
      {mode === 'members' && (
        <p className="memory-notice">
          AI summaries may contain mistakes. Review every profile and choose which connected leagues
          may use it. Notes enter prompts only when member context is enabled in Settings. Deleting
          a profile also deletes its imported source text.
        </p>
      )}
      <div className="profile-list">
        {profiles.map((profile) => {
          const value = edits[profile.id] ?? {
            name: profile.name,
            styleNotes: profile.styleNotes,
            contextNotes: profile.contextNotes,
            banterPreference: profile.banterPreference ?? '',
            avoidTopics: profile.avoidTopics ?? '',
            includeInReports: profile.includeInReports !== false,
            includeAllLeagues: profile.leagueIds === undefined,
            leagueIds: profile.leagueIds ?? [],
          };
          return (
            <article className="profile-card" key={profile.id}>
              <div className="profile-head">
                <div>
                  <span className="panel-kicker">
                    {profile.updatedAt
                      ? `UPDATED ${new Date(profile.updatedAt).toLocaleDateString()}`
                      : `IMPORTED ${new Date(profile.importedAt).toLocaleDateString()}`}{' '}
                    · {profile.sourceName}
                  </span>
                  <h2>{profile.name}</h2>
                </div>
                <div className="profile-buttons">
                  {mode === 'members' && (
                    <>
                      <button
                        className="small-button"
                        onClick={() => clearLearnedNotes(profile.id)}
                      >
                        Clear style and context
                      </button>
                      <button className="small-button" onClick={() => void saveProfile(profile.id)}>
                        <Save size={13} /> Save notes
                      </button>
                    </>
                  )}
                  <button
                    className="small-button danger"
                    onClick={() => void deleteProfile(profile.id)}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
              {mode === 'members' ? (
                <div className="settings-fields two">
                  <label className="wide profile-optout">
                    <input
                      type="checkbox"
                      checked={value.includeInReports}
                      onChange={(event) =>
                        setEdits((all) => ({
                          ...all,
                          [profile.id]: { ...value, includeInReports: event.target.checked },
                        }))
                      }
                    />
                    Include this member's saved notes in AI context
                    <small>
                      Turn this off to exclude their style, context, banter preferences, and topic
                      boundaries from future prompts. Group-chat use also requires its separate
                      Settings opt-in. Imported source messages remain stored locally. Import
                      analysis has a separate Settings control.
                    </small>
                  </label>
                  <div className="wide member-league-scope">
                    <span>USE THIS PROFILE IN</span>
                    <label>
                      <input
                        type="checkbox"
                        checked={value.includeAllLeagues}
                        onChange={(event) =>
                          setEdits((all) => ({
                            ...all,
                            [profile.id]: { ...value, includeAllLeagues: event.target.checked },
                          }))
                        }
                      />
                      Every connected league
                    </label>
                    {!value.includeAllLeagues &&
                      (leagues.length > 0 ? (
                        leagues.map((league) => (
                          <label key={league.id}>
                            <input
                              type="checkbox"
                              checked={value.leagueIds.includes(league.id)}
                              onChange={(event) => {
                                const selected = new Set(value.leagueIds);
                                if (event.target.checked) selected.add(league.id);
                                else selected.delete(league.id);
                                setEdits((all) => ({
                                  ...all,
                                  [profile.id]: { ...value, leagueIds: [...selected] },
                                }));
                              }}
                            />
                            {league.displayName}
                          </label>
                        ))
                      ) : (
                        <small>Connect a league before assigning this profile.</small>
                      ))}
                    {!value.includeAllLeagues && leagues.length > 0 && (
                      <small>
                        If no leagues are selected, this profile is left out of reports.
                      </small>
                    )}
                  </div>
                  <label>
                    MEMBER DISPLAY NAME
                    <input
                      value={value.name}
                      onChange={(event) =>
                        setEdits((all) => ({
                          ...all,
                          [profile.id]: { ...value, name: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label>
                    WRITING STYLE NOTES
                    <textarea
                      value={value.styleNotes}
                      onChange={(event) =>
                        setEdits((all) => ({
                          ...all,
                          [profile.id]: { ...value, styleNotes: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label>
                    HOW TO BANTER WITH THEM
                    <textarea
                      value={value.banterPreference}
                      maxLength={1000}
                      onChange={(event) =>
                        setEdits((all) => ({
                          ...all,
                          [profile.id]: { ...value, banterPreference: event.target.value },
                        }))
                      }
                      placeholder="Keep it playful; tease their waiver-wire habits."
                    />
                  </label>
                  <label>
                    TOPICS TO AVOID FOR THIS MEMBER
                    <textarea
                      value={value.avoidTopics}
                      maxLength={1000}
                      onChange={(event) =>
                        setEdits((all) => ({
                          ...all,
                          [profile.id]: { ...value, avoidTopics: event.target.value },
                        }))
                      }
                      placeholder="Personal topics they prefer to avoid"
                    />
                  </label>
                  <label className="wide">
                    LEAGUE CONTEXT
                    <textarea
                      value={value.contextNotes}
                      onChange={(event) =>
                        setEdits((all) => ({
                          ...all,
                          [profile.id]: { ...value, contextNotes: event.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
              ) : (
                <details className="source-details">
                  <summary>
                    View imported source ({profile.sourceLength.toLocaleString()} characters)
                  </summary>
                  <pre>
                    {profile.sourceLength
                      ? 'Source text is stored locally and available in the memory export. Use Export memory from Members & memory to download it.'
                      : 'No source text is retained. It may have expired under the retention setting; member notes remain available.'}
                  </pre>
                </details>
              )}
            </article>
          );
        })}
        {profiles.length === 0 && (
          <div className="empty-state">
            <FileUp size={23} />
            <strong>No imported profiles.</strong>
            <p>
              {mode === 'imports'
                ? 'Choose an export file to get started.'
                : 'Import a conversation archive to build member context.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function chatReplyResultText(drafts = 0, sent = 0): string {
  if (sent > 0)
    return ` ${sent} addressed message(s) received an automatic reply; other replies remain drafts in Schedule & drafts.`;
  return drafts > 0
    ? ` ${drafts} addressed message(s) created reply drafts in Schedule & drafts.`
    : '';
}
