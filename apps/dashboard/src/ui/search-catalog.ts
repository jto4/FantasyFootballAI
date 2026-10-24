import type { AdviceMode, SettingsSection } from '@sidekick/core';
import { adviceChoices } from './advice-navigation';
import { helpArticles } from './help-content';
import type { SearchTask } from './search-tasks';

export type SearchDestination = {
  section: string;
  settingId?: string;
  leagueId?: string;
  reportId?: string;
  helpId?: string;
  adviceMode?: AdviceMode;
  adviceId?: string;
  adviceView?: 'results';
  task?: SearchTask;
};
export type SearchItem = {
  id: string;
  title: string;
  description: string;
  location: string;
  kind: 'Setting' | 'Page' | 'League' | 'Report' | 'Help' | 'Task';
  aliases: string;
  destination: SearchDestination;
};
const sectionNames: Record<SettingsSection, string> = {
  ai: 'AI connection',
  voice: 'Voice',
  delivery: 'Delivery & access',
  schedules: 'Schedules & sources',
  privacy: 'Privacy',
  personalize: 'Personalize',
  storage: 'Storage & desktop',
};
// Everyday phrases belong beside their destinations so names and navigation evolve together.
const definitions: [string, SettingsSection, string, string, string, boolean?][] = [
  [
    'yahoo-access',
    'delivery',
    'Yahoo Fantasy connection',
    'Set up your approved Yahoo app and authorize league access.',
    'yahoo oauth authorization authorize login private league developer app client id secret',
  ],
  [
    'ai-runtime',
    'ai',
    'AI connection',
    'Choose the service or local app that writes your updates.',
    'artificial intelligence provider runtime local cli apple openai connection setup',
  ],
  [
    'ai-model',
    'ai',
    'AI model',
    'Choose which model writes your updates.',
    'change model chatgpt gpt ollama',
  ],
  [
    'ai-endpoint',
    'ai',
    'AI server address',
    'Set the address of your chosen AI service.',
    'api base url endpoint server local ollama',
  ],
  [
    'ai-temperature',
    'ai',
    'AI creativity',
    'Control how predictable or varied the writing is.',
    'temperature creativity random variation',
  ],
  [
    'ai-output',
    'ai',
    'AI response limit',
    'Set the maximum size of an AI response.',
    'output tokens token limit maximum',
  ],
  [
    'ai-pricing',
    'ai',
    'AI cost estimates',
    'Enter model prices to estimate generation costs.',
    'input output price pricing cost budget spend',
  ],
  [
    'writing-style',
    'voice',
    'Writing style',
    'Make league updates funny, serious, or your own style.',
    'tone personality voice banter humor funny serious custom',
  ],
  [
    'style-presets',
    'voice',
    'Saved writing styles',
    'Save a favorite voice and use it again.',
    'style presets templates saved voice favorite',
  ],
  [
    'report-length',
    'voice',
    'Report length',
    'Choose short, standard, or long reports.',
    'shorter reports longer reports word count length concise brief',
  ],
  [
    'profanity',
    'voice',
    'Allow profanity',
    'Choose whether reports may include swear words.',
    'stop swearing curse words cursing bad language clean family friendly profanity',
  ],
  [
    'excluded-topics',
    'voice',
    'Topics to avoid',
    'Keep certain subjects out of league banter.',
    'excluded topics boundaries politics family health avoid jokes',
  ],
  [
    'channel-boundaries',
    'voice',
    'Topics to avoid by destination',
    'Set extra boundaries for email, text messages, or dashboard drafts.',
    'channel boundaries destination extra topics email sms imessage',
  ],
  [
    'email-recipient',
    'delivery',
    'Email recipient',
    'Choose the email address that receives league updates.',
    'email address recipient destination send emails change email',
  ],
  [
    'sms-recipient',
    'delivery',
    'Text message recipient',
    'Choose a phone number or Twilio group conversation.',
    'sms recipient phone number text message destination twilio conversation',
  ],
  [
    'imessage-group',
    'delivery',
    'iMessage group',
    'Choose the group chat for league updates.',
    'imessage imsg local chat guid group identifier apple messages bluebubbles',
  ],
  [
    'owner-name',
    'delivery',
    'Your group-chat name',
    'Identify your own messages in the group.',
    'my name owner name imessage identity',
  ],
  [
    'chat-agent-name',
    'delivery',
    'Assistant name in chat',
    'Choose the name friends use to ask for a reply.',
    'agent name mention nickname assistant bot name',
  ],
  [
    'chat-reply-league',
    'delivery',
    'League for chat replies',
    'Choose the league the assistant talks about in chat.',
    'chat reply league context group',
  ],
  [
    'chat-replies',
    'delivery',
    'Chat reply drafts',
    'Choose whether the assistant drafts replies when mentioned.',
    'reply respond mentions group chat agent replies',
  ],
  [
    'chat-auto-send',
    'delivery',
    'Automatic chat replies',
    'Choose whether generated chat replies are sent automatically.',
    'stop automatic replies auto send chat messages turn off bot',
  ],
  [
    'sms-sync',
    'delivery',
    'Text conversation sync',
    'Choose whether Twilio group messages sync automatically.',
    'sms sync twilio conversation import automatically interval',
  ],
  [
    'imessage-sync',
    'delivery',
    'iMessage sync',
    'Choose whether group messages sync automatically.',
    'imessage imsg sync bluebubbles messages import automatically interval',
  ],
  [
    'member-memory',
    'privacy',
    'Member memory',
    'Choose whether the app uses local member profiles.',
    'remember people memory enable disable profiles privacy',
  ],
  [
    'import-analysis',
    'privacy',
    'AI analysis of imported messages',
    'Choose whether imported conversations are sent to your AI for analysis.',
    'analyze imports conversations messages ai privacy sharing',
  ],
  [
    'report-memory',
    'privacy',
    'Member notes in reports',
    'Choose whether reviewed member notes are shared with AI for reports.',
    'share member context notes reports report privacy',
  ],
  [
    'chat-memory',
    'privacy',
    'Member notes in chat replies',
    'Choose whether reviewed member notes are shared with AI for chat replies.',
    'share member context notes chat privacy',
  ],
  [
    'source-retention',
    'privacy',
    'Keep or delete imported messages',
    'Choose how long original imported conversations stay on this computer.',
    'delete old messages retention source text thirty 30 ninety 90 days cleanup',
  ],
  [
    'automatic-actions',
    'schedules',
    'Report schedules and automatic sending',
    'Choose when reports run and whether to review before sending.',
    'schedule reports automation automatic delivery stop sending review first timezone saved data snapshot import offline draft recent',
  ],
  [
    'league-calendar',
    'schedules',
    'League calendar',
    'Add a draft day or season date for a scheduled report.',
    'draft date season calendar milestone event',
  ],
  [
    'league-staleness',
    'schedules',
    'Old league-data warnings',
    'Choose when to warn that standings or rosters need refreshing.',
    'stale data freshness old standings rosters warning',
  ],
  [
    'refresh-retries',
    'schedules',
    'League refresh retries',
    'Choose extra attempts after a temporary league refresh failure.',
    'scheduled sync retry retries attempts errors',
  ],
  [
    'news-sources',
    'schedules',
    'Football news sources',
    'Choose which news outlets appear in your updates.',
    'news sources feeds espn pff fox cbs pro football talk headlines',
  ],
  [
    'injury-reports',
    'schedules',
    'NFL injury reports',
    'Choose whether current injury reports are included in league analysis.',
    'injury injuries practice injured players nflverse',
  ],
  [
    'news-refresh',
    'schedules',
    'News refresh interval',
    'Choose how often football headlines update.',
    'news refresh minutes frequency interval updates',
  ],
  [
    'mcp-delivery',
    'schedules',
    'MCP sending permission',
    'Choose whether a connected MCP client may send a saved report.',
    'mcp clients sending permission tools external assistant',
  ],
  [
    'appearance',
    'personalize',
    'Appearance and display',
    'Theme, text size, density, motion, start page, odds and clock format.',
    'dark mode light mode system theme text size font bigger smaller compact density reduce motion animation start page odds format decimal american implied 24 hour clock',
  ],
  [
    'home-layout',
    'personalize',
    'Home layout',
    'Show, hide and reorder the cards on Home.',
    'home cards layout reorder hide show dashboard customize',
  ],
  [
    'notification-preferences',
    'personalize',
    'Notifications',
    'Choose which game-day alerts you get, how early, and quiet hours.',
    'notifications alerts quiet hours do not disturb lead time injury inactive bye game day summary',
  ],
  [
    'lineup-strategy',
    'personalize',
    'Lineup strategy',
    'Choose safe, balanced, upside or maximize-win-chance lineups.',
    'lineup strategy floor ceiling upside safe risk variance boom bust win probability',
  ],
  [
    'projection-preferences',
    'personalize',
    'Projection adjustments and player nudges',
    'Turn model adjustments on or off and nudge players you see differently.',
    'projection adjustments wind injuries carries nudge override boost lower player my take',
  ],
  [
    'watchlist',
    'personalize',
    'Watchlist',
    'Players to keep an eye on, with alerts when they are ruled out.',
    'watchlist watch list follow track players favorites',
  ],
  [
    'prop-preferences',
    'personalize',
    'Props and sportsbooks',
    'Minimum edge for prop leans, which sportsbooks to show, and line saving.',
    'props sportsbook books draftkings fanduel minimum edge threshold leans betting',
  ],
  [
    'ai-style',
    'personalize',
    'Ask and advice style',
    'Tone, answer length and which model each task uses.',
    'tone style length brief detailed friendly playful model per task chat advice reports',
  ],
  [
    'routine-backups',
    'storage',
    'Automatic backups',
    'Save encrypted daily or weekly copies and choose how many to keep.',
    'automatic backups scheduled routine encrypted retention copies daily weekly recover',
  ],
  [
    'local-backup',
    'storage',
    'Download or restore a backup',
    'Download a copy of your data or restore a previous copy.',
    'manual backup export download restore recovery password passphrase',
  ],
  [
    'validate-backup',
    'storage',
    'Check a backup file',
    'Check whether a backup is valid before restoring it.',
    'validate backup test file dry run check corrupted',
  ],
  [
    'diagnostics',
    'storage',
    'Troubleshooting summary',
    'Check app health or download a safe summary for support.',
    'diagnostics troubleshoot errors problems failure queue support app health',
  ],
  [
    'runtime-logs',
    'storage',
    'Recent app activity',
    'View recent local service events for troubleshooting.',
    'logs runtime recent events history errors',
  ],
  [
    'desktop-startup',
    'storage',
    'Open at sign-in',
    'Choose whether Sidekick opens when you sign in to your computer.',
    'launch startup login sign in automatic start boot',
    true,
  ],
  [
    'desktop-hidden',
    'storage',
    'Start in the system tray',
    'Keep the app running without opening its window at sign-in.',
    'hidden start background tray startup minimize',
    true,
  ],
  [
    'desktop-updates',
    'storage',
    'App updates',
    'Check for a newer desktop version.',
    'desktop update upgrade version download install',
    true,
  ],
  [
    'data-folder',
    'storage',
    'Local data folder',
    'Choose where the desktop app keeps its data.',
    'data directory storage folder move files location disk',
    true,
  ],
  [
    'credential-openai',
    'ai',
    'AI API key',
    'Connect your chosen AI service with its secret key.',
    'openai api key token credentials password chatgpt',
  ],
  [
    'credential-espn',
    'delivery',
    'ESPN private-league access',
    'Connect a private ESPN league with your saved credentials.',
    'espn swid espn s2 cookie login private league credentials',
  ],
  [
    'credential-resend',
    'delivery',
    'Email service connection',
    'Connect Resend so you can send league emails.',
    'resend email sender from api key credentials connection',
  ],
  [
    'credential-twilio',
    'delivery',
    'Text message service connection',
    'Connect Twilio for SMS or group conversations.',
    'twilio sms account sid auth token credentials connection',
  ],
  [
    'credential-bluebubbles',
    'delivery',
    'iMessage service connection',
    'Connect the BlueBubbles bridge for Apple messages.',
    'bluebubbles imessage bridge server password credentials connection',
  ],
  [
    'credential-image-generation',
    'storage',
    'OpenAI image connection',
    'Connect the service used to generate images.',
    'openai images image generation api key credentials',
  ],
  [
    'credential-stability-image-generation',
    'storage',
    'Stability image connection',
    'Connect Stability for image generation.',
    'stability stable diffusion image generation api key credentials',
  ],
];
export const settingTargets = definitions.map(
  ([id, section, title, description, aliases, desktopOnly]) => ({
    id,
    section,
    title,
    description,
    aliases,
    desktopOnly: desktopOnly === true,
  }),
);
export function settingTarget(id: string) {
  return settingTargets.find((target) => target.id === id);
}
export function navigationItems(desktop: boolean): SearchItem[] {
  const pages = [
    [
      'Advice',
      'Analyze fantasy decisions and NFL bets with supporting evidence.',
      'advice intelligent analysis confidence stats',
    ],
    [
      'Help',
      'Find answers and follow a direct recovery action.',
      'help faq questions support tutorial instructions',
    ],
    [
      'League desk',
      'See your league overview and drafts waiting for review.',
      'home dashboard standings rankings news',
    ],
    [
      'Leagues',
      'Connect, refresh, or remove a fantasy league.',
      'add connect league sleeper yahoo espn league url standings teams',
    ],
    [
      'Schedule',
      'Review upcoming work and past runs.',
      'scheduled jobs upcoming calendar failed retry drafts',
    ],
    [
      'Reports',
      'Find, review, edit, and send saved reports.',
      'report history drafts send rankings matchup preview draft hype review',
    ],
    [
      'Members & memory',
      'Review member profiles, notes, and banter preferences.',
      'members people profiles memory notes opt out banter',
    ],
    [
      'Imports',
      'Import conversations, emails, or player projections.',
      'upload import whatsapp discord slack csv projections messages emails',
    ],
    [
      'Settings',
      'Personalize writing, privacy, connections, and backups.',
      'preferences configuration options settings',
    ],
  ];
  return [
    ...adviceChoices.map((choice): SearchItem => ({
      id: `advice:${choice.mode}`,
      title: choice.title,
      description: choice.description,
      aliases: choice.aliases,
      location: 'Advice',
      kind: 'Page',
      destination: { section: 'Advice', adviceMode: choice.mode },
    })),
    ...helpArticles.map((article): SearchItem => ({
      id: `help:${article.id}`,
      title: article.title,
      description: article.answer,
      location: `Help & FAQ → ${article.category}`,
      aliases: article.aliases,
      kind: 'Help',
      destination: { section: 'Help', helpId: article.id },
    })),
    ...pages.map(([title, description, aliases]) => ({
      id: `page:${title}`,
      title:
        title === 'League desk' ? 'Home' : title === 'Members & memory' ? 'League members' : title!,
      description: description!,
      aliases: aliases!,
      location: 'Workspace',
      kind: 'Page' as const,
      destination: { section: title! },
    })),
    ...settingTargets
      .filter((target) => desktop || !target.desktopOnly)
      .map((target) => ({
        id: `setting:${target.id}`,
        title: target.title,
        description: target.description,
        aliases: target.aliases,
        location: `Settings → ${sectionNames[target.section]}`,
        kind: 'Setting' as const,
        destination: { section: 'Settings', settingId: target.id },
      })),
  ];
}
