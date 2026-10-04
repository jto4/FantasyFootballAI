export {
  OpenAICompatibleProvider,
  LocalCLIProvider,
  AppleFoundationModelCLIProvider,
  parseCLIArguments,
} from './ai.js';
export { YahooOAuthClient } from './yahoo-oauth.js';
export {
  BlueBubblesChannel,
  DeliveryFailure,
  fetchBlueBubblesMessages,
  fetchTwilioConversationMessages,
  isBlueBubblesConfigured,
  ResendChannel,
  sendResendTestEmail,
  TwilioChannel,
  TwilioConversationsChannel,
  verifyTwilioCredentials,
  imessageAvailability,
} from './channels.js';
export type {
  BlueBubblesMessage,
  TwilioConversationMessage,
  TwilioConversationMessagePage,
} from './channels.js';
export { generateImage } from './image.js';
export { getReceivedEmail, listReceivedEmails } from './received-email.js';
export type { ReceivedEmail, ReceivedEmailSummary } from './received-email.js';
export {
  fetchNFLInjuryReports,
  matchRosterInjuries,
  NFLInjuryReportCache,
  nflInjuryReportUrl,
  parseNFLInjuryReports,
} from './injuries.js';
export type {
  MatchedNFLInjuryReport,
  NFLInjuryReportRow,
  NFLInjuryReportSnapshot,
} from './injuries.js';
export { fetchFootballNews as getFootballNews, FootballNewsCache } from './news.js';
export type { FootballNewsLoad, FootballNewsSnapshot } from './news.js';

export {
  connectorFor,
  EspnConnector,
  SleeperConnector,
  SleeperPlayerCatalog,
  YahooConnector,
} from './platforms.js';
