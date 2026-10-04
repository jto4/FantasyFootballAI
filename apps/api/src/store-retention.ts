import { blueBubblesMemorySource, pruneBlueBubblesHistory } from './bluebubbles-memory.js';
import {
  pruneTwilioConversationHistory,
  twilioConversationMemorySource,
} from './twilio-conversation-memory.js';
import { pruneConversationImports } from './conversation-import.js';
import type { AppState } from './store-types.js';
export function purgeExpiredConversationSources(state: AppState, now = Date.now()): number {
  const days = state.settings.conversationRetentionDays;
  if (days !== 30 && days !== 90 && days !== 365) return 0;
  const cutoff = now - days * 24 * 60 * 60 * 1_000;
  let removed = 0;
  for (const profile of state.memories) {
    if (profile.sourceName === twilioConversationMemorySource && profile.sourceText) {
      const pruned = pruneTwilioConversationHistory(profile.sourceText, cutoff);
      if (pruned.removed > 0) {
        profile.sourceText = pruned.sourceText;
        removed += 1;
      }
      continue;
    }
    if (profile.sourceName === blueBubblesMemorySource && profile.sourceText) {
      const pruned = pruneBlueBubblesHistory(profile.sourceText, cutoff);
      if (pruned.removed > 0) {
        profile.sourceText = pruned.sourceText;
        removed += 1;
      }
      continue;
    }
    if (profile.sourceName === 'Resend received email' && profile.sourceText) {
      const entries = profile.sourceText.split(/(?=\[\[resend-email:)/g);
      const retained = entries.filter((entry) => {
        const timestamp = entry.match(/^\[\[resend-email:[^\]]+\]\]\nDate: ([^\n]+)/)?.[1];
        const receivedAt = timestamp ? Date.parse(timestamp) : Number.NaN;
        return !Number.isFinite(receivedAt) || receivedAt >= cutoff;
      });
      if (retained.length < entries.length) {
        profile.sourceText = retained.join('').trim();
        removed += 1;
      }
      continue;
    }
    if (profile.sourceText.includes('[[conversation-import:')) {
      const pruned = pruneConversationImports(profile.sourceText, profile.importedAt, cutoff);
      if (pruned.removed > 0) {
        profile.sourceText = pruned.sourceText;
        removed += 1;
      }
      continue;
    }
    const importedAt = Date.parse(profile.importedAt);
    if (profile.sourceText && Number.isFinite(importedAt) && importedAt < cutoff) {
      profile.sourceText = '';
      removed += 1;
    }
  }
  return removed;
}
