export {
  OpenAICompatibleProvider,
  LocalCLIProvider,
  ClaudeCLIProvider,
  createLocalCLIProvider,
  AppleFoundationModelCLIProvider,
  parseCLIArguments,
} from './ai.js';
export { adviceModelChoices, isOfficialOpenAI, isOpenAIReasoningModel } from './ai-capabilities.js';
export { adviceInjuryEvidence } from './injuries.js';
export {
  SignedInClaudeConnection,
  SignedInAIError,
  type SignedInAIConnection,
} from './signed-in-ai.js';
export {
  SignedInCodexConnection,
  SignedInCodexError,
  signedInCodexModel,
} from './signed-in-codex.js';
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
  AdviceInjuryEvidence,
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
export { readBoundedJson } from './http.js';
export { nflDraftPicksUrl, parseNFLDraftPicks } from './nfl-draft-data.js';
export { nflPlayersUrl, parsePlayerBios, PublicPlayerBios } from './player-bios.js';
export { sleeperFormat } from './platforms/sleeper.js';
export { espnFormat } from './platforms/espn.js';
export {
  PublicPlayerForecasts,
  publicPlayerForecastUrl,
  publicPlayerForecastFilter,
  parsePublicPlayerForecasts,
} from './player-forecasts.js';
export { getSleeperPlayerCatalog } from './platforms/sleeper.js';
export {
  PublicFootballData,
  playerStatsUrl,
  footballScheduleUrl,
  parsePlayerGameStats,
  parseFootballGames,
  parsePlayerMarket,
} from './football-data.js';

export {
  PublicTeamDefenseData,
  parseTeamDefenseStats,
  parseTeamDefenseTotals,
  defenseStatsUrl,
  teamStatsUrl,
} from './team-defense-data.js';
export {
  PublicSportsbookLines,
  parseSportsbookQuotes,
  parseFinalFootballResult,
} from './sportsbook-lines.js';
export { PublicPropLines, type PropLinesSnapshot, type BookLinesSnapshot } from './prop-lines.js';
export {
  buildPregameAvailability,
  parseQuarterbackObservations,
  type QuarterbackObservation,
} from './game-availability.js';
export {
  gameWeatherRequest,
  parseGameWeather,
  fetchGameWeather,
  weatherVenue,
  PublicGameWeather,
} from './game-weather.js';
export { PublicPregameEvidence, type PregameEvidenceProvider } from './game-pregame.js';
export { fetchHistoricalQuarterbacks, fetchCurrentQuarterbacks } from './game-quarterbacks.js';

export {
  GameDayInjuries,
  fetchDatedGameInjuries,
  parseDatedGameInjuries,
} from './game-injuries.js';
export {
  parsePersonnelPerformance,
  parsePersonnelSnaps,
  fetchPersonnelSeason,
  addPregamePersonnel,
  preparePersonnelEvidence,
  type PersonnelPerformance,
  type PersonnelSnaps,
} from './game-personnel.js';
export {
  parseOfficialGameInjuries,
  officialInjuriesForGame,
  fetchOfficialGameInjuries,
  type OfficialGameInjuries,
} from './official-game-injuries.js';

export { ImsgClient, ImsgChannel, isImsgChatGuid, resolveImsgExecutable } from './imsg.js';
export { resolveVerificationProfile } from './verification-profile.js';
export { PublicPredictionMarketData } from './prediction-market-data.js';

export { normalizeEspnLeague } from './platforms/espn.js';
export { espnSnapshotWeeklyProjections } from './espn-snapshot-projections.js';
export { AnthropicProvider, defaultClaudeModel } from './anthropic-ai.js';
export { PublicNflScoreboard, parseNflScoreboard, type LiveNflGame } from './nfl-scoreboard.js';
export { parseNflBoxScore, PublicNflBoxScores, type LiveBoxScore } from './nfl-boxscore.js';
export {
  compactDepthCharts,
  parseDepthCharts,
  PublicUsageData,
  type UsageSnapshot,
} from './usage-data.js';
export { cachedDownload, configureDownloadCache, type CachedValue } from './download-cache.js';
