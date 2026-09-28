import { createElement, type Dispatch, type SetStateAction } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@sidekick/core';
import { DeliveryChannelsSection } from './DeliveryChannelsSection.js';

describe('delivery channel settings section', () => {
  it('keeps direct mention replies review-first and explains group delivery requirements', () => {
    const settings = {
      emailRecipient: '',
      smsRecipient: '',
      imessageChatGuid: '',
      imessageOwnerName: 'League owner',
      memoryEnabled: true,
      twilioConversationAutoSyncEnabled: false,
      twilioConversationSyncIntervalMinutes: 15,
      imessageAutoSyncEnabled: false,
      imessageSyncIntervalMinutes: 15,
      chatAgentName: 'Sunday Sidekick',
      chatReplyLeagueId: '',
      chatRepliesEnabled: false,
      chatRepliesAutoSend: false,
    } as AppSettings;
    const markup = renderToStaticMarkup(
      createElement(DeliveryChannelsSection, {
        settings,
        setSettings: vi.fn() as Dispatch<SetStateAction<AppSettings>>,
        leagues: [],
        twilioConfigured: false,
        twilioAutoSyncStatus: null,
        blueBubblesConfigured: false,
        imessageAutoSyncStatus: null,
        blueBubblesWebhookConfigured: false,
        blueBubblesWebhookUrl: '',
        onCreateWebhook: vi.fn(),
        onRevokeWebhook: vi.fn(),
        onNotice: vi.fn(),
      }),
    );

    expect(markup).toContain('EMAIL RECIPIENT');
    expect(markup).toContain('SMS RECIPIENT OR TWILIO GROUP SID');
    expect(markup).toContain('Live message webhook');
    expect(markup).toContain('Draft a reply when someone directly addresses the agent');
    expect(markup).toContain('Send generated chat replies automatically');
    expect(markup).toContain('By default, review and send from Schedule &amp; drafts.');
  });
});
