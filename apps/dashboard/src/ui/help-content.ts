export const helpArticles = [
  {
    id: 'imsg-setup',
    title: 'Can I use local Messages through imsg?',
    category: 'Connections',
    aliases:
      'imsg local macOS iMessage apple Messages send history sync full disk access automation',
    answer:
      'Yes. In Settings → Delivery & access, choose Local Messages via imsg (macOS). Install imsg 0.15.10 or later on the same Mac running the app or service. Check installation, then Find iMessage chats and choose a conversation to fill its stable GUID and local history ID. Save Delivery & access. An optional absolute executable path supports other install locations. History requires Full Disk Access for the parent app or service; sending needs Messages Automation permission. Member memory, AI analysis, mention replies and automatic sending retain their separate opt-ins. Switching providers turns off automatic sync and sending until reapproved. Ambiguous sends are not retried automatically. Standard text delivery and bounded manual/interval history sync are supported; no injected private-framework features are enabled.',
    action: { label: 'Set up iMessage', section: 'Settings', settingId: 'imessage-group' },
  },
  {
    id: 'advice-game-context',
    title: 'How do injuries, quarterback changes and weather affect predictions?',
    category: 'Advice',
    aliases:
      'injuries injured quarterback changes starter backup depth chart weather wind rain cold temperature forecast totals official NFL report publication snap counts passing efficiency',
    answer:
      'In Advice, choose Analyze a bet and review the supporting numbers. Supported totals can use dated Out and Doubtful quarterback designations, reported offensive/defensive absences, captured quarterback depth-chart changes and regional weather forecasts. Effects are learned from earlier games; there is no fixed injury points penalty. Moneyline and spread probabilities retain the older model because earlier tests did not support an improvement for those markets. Missing reports do not prove health, and a depth-chart listing does not confirm who will play. Weather is limited to supported outdoor venues, uses an archived two-day forecast and is only available within 36 hours before kickoff. Covered or unverified venues remain unknown. Accuracy details show historical coverage and comparisons with the earlier model and sportsbook. Official NFL injury articles must have a last-modified date before the prediction cutoff. Prior snap roles and quarterback passing efficiency are also shown as supporting context, but their tested numerical corrections performed worse and remain disabled. More data does not automatically mean better predictions. These reused historical tests do not establish a consistent edge or future profit.',
    action: { label: 'Review a bet in Advice', section: 'Advice', adviceMode: 'betting' },
  },
  {
    id: 'advice-live-prices',
    title: 'How do I fetch sportsbook lines?',
    category: 'Advice',
    aliases:
      'live sportsbook betting lines odds DraftKings ESPN spread moneyline total refresh prices fetch',
    answer:
      'In Advice, choose Analyze a bet, an upcoming NFL game and Moneyline, Spread or Total. Click Fetch sportsbook prices, then Use this price for the displayed sportsbook. Sidekick fills both sides’ odds and the selected handicap or total. These public ESPN snapshots need no new key and may have limited sportsbook coverage. Retrieval time is shown; prices can change. Refresh if a selection expires. Analysis checks it again before and after generation. Changing a number makes it a manual price. For player props, pick a published line from the list after choosing the game: ESPN lists lines without prices, and an optional The Odds API key in Credentials adds prices and other sportsbooks. Fetching never places a bet.',
    action: { label: 'Analyze a bet', section: 'Advice', adviceMode: 'betting' },
  },
  {
    id: 'advice-track-record',
    title: 'How accurate and profitable are the predictions?',
    category: 'Advice',
    aliases:
      'prediction accuracy performance profitability profit ROI backtest historical betting market prices paper results track record calibration',
    answer:
      'Open Prediction accuracy and paper results in Advice. New analyses save forecasts before kickoff; Check finished games compares them with verified final games and complete recorded player scoring. Missing appearances stay unknown. Fantasy results show average points error; betting forecasts show probability error and calibration. Paper results use hypothetical one-unit stakes at fetched prices, with at most one actionable selection per game and market. Test historical market prices compares the improved model, the previous model and sportsbook probabilities on two completed seasons. The improved game model uses both sportsbook prices as an input, opponent-adjusted recent scoring and a home-venue adjustment, with small corrections learned from earlier games. Supported totals also use dated injury designations, captured quarterback chart changes and archived regional wind, cold and precipitation forecasts. Missing reports do not prove health; depth-chart listings do not confirm participation. Covered/retractable or mismatched venues have no invented weather input. Weather has a two-day lead and a conservative availability bound, so it is only used within 36 hours before kickoff. Older tests favored retaining v3 moneyline/spread probabilities. V3 also uses schedule rest, season phase and earlier team results against the line; moneyline corrections shrink toward the book using earlier evaluation. Parameters were selected on older seasons. Recent seasons have already been examined and are reused historical evidence. A small pooled improvement does not mean it beats the book consistently. Its uncertainty view explains whether the accuracy difference is clear; an interval that includes zero does not establish an advantage over the book. The archive has no verified publication times or sportsbook identity, so those returns are retrospective simulations. Past outcomes existed during development. Neither positive historical returns nor evidence confidence establish future profit. Export the local track record before clearing it. No real wagers are placed.',
    action: { label: 'View prediction results', section: 'Advice' },
  },
  {
    id: 'advice-public-forecasts',
    title: 'Where do public player forecasts come from?',
    category: 'Advice',
    aliases:
      'own weekly projections model player forecast rookie expected stats keyless no API key remaining championship',
    answer:
      'Advice makes its own weekly projection for each player: recent games weigh most, adjusted for snap share and depth-chart changes, extra carries when a teammate running back is ruled out, forecast wind inside 36 hours of kickoff, the betting total and spread, the opponent and home field. Projected statistics are scored with your league’s rules; kickers and defenses are projected from their own scored history and the betting total. Players need three prior games. Each estimate carries a likely range (8 in 10 similar projections finished inside it), and Home shows your chance to win the matchup before kickoff. Remaining-season comparisons add only the exact future scheduled weeks you are comparing. Matching scoring-confirmed imports take priority. Player details show expected yards, catches or workload, future games, future points and any separately recorded points. Missing weekly forecasts, ambiguous identity, unsupported scoring or stale data can withhold this estimate; historical estimates may still work where enough evidence exists. Full-season totals during the season include recorded points and cannot show what was knowable before the draft. Remaining trade points respect your final week and exclude started games and byes. Source dates show when Sidekick fetched the data, not when the publisher last updated it. Forecast accuracy and future playing time are unverified, so these choices remain tentative. No new API key is required.',
    action: { label: 'Compare players in Advice', section: 'Advice' },
  },
  {
    id: 'advice-rookies',
    title: 'Can Advice compare rookies without NFL history?',
    category: 'Advice',
    aliases:
      'rookie rookies college NFL draft capital round overall pick rookie projections no history missing stats young players',
    answer:
      'Advice can show a matched player’s NFL draft year, round, overall pick and college from public data, with no new key. NFL draft position describes where a team selected the player; it is different from fantasy draft position and does not establish their current role or playing time. When enough data is available, player details compare recorded scoring for earlier rookies at the same position with similar draft rounds, using your league’s scoring. Those comparisons favor players who earned appearances. They are historical context, not this rookie’s forecast or chance of success. Sidekick’s own weekly projection needs three prior NFL games, so a rookie without them gets no automatic estimate. Add a scoring-confirmed projection through Imports when automatic estimates are unavailable; matching imports take priority. Draft facts and missing history never become an invented points estimate or zero. Imports must cover the season and weeks you are comparing.',
    action: { label: 'Add rookie projections', section: 'Imports' },
  },
  {
    id: 'advice-defense',
    title: 'Can I compare team defenses and special teams?',
    category: 'Advice',
    aliases:
      'defense defence DST DEF team defense special teams sacks interceptions points allowed fantasy start sit forecast',
    answer:
      'For supported Sleeper leagues, Advice can compare defenses using published D/ST statistics and your actual scoring. Choose Set my lineup, then Compare players for one spot, and select defenses from your team. History shows sacks, interceptions, defensive fumble recoveries, touchdowns, points allowed and opponent yards. Fantasy points allowed can differ from the final score: an opponent’s defensive touchdown is excluded, while the conversion afterward still counts. Defense and special-teams events stay separate. Missing fields become zero only when independent team totals prove it; unresolved touchdowns or custom scoring can withhold an automatic estimate. Weekly estimates use recent complete history; draft and trade estimates also require a complete schedule and enough earlier tested games. Scoring-confirmed imports take priority. Current defensive personnel, weather and future turnovers remain uncertain. Yahoo and ESPN automatic D/ST scoring is not verified.',
    action: { label: 'Compare defenses', section: 'Advice', adviceMode: 'lineup' },
  },
  {
    id: 'advice-kickers',
    title: 'Can I compare kickers using my league’s scoring?',
    category: 'Advice',
    aliases:
      'kicker kicking field goal extra point PAT blocked missed kick weather start sit projections forecast',
    answer:
      'Yes, when public history matches the player and supports your league’s scoring. In Advice, choose Set my lineup and Compare players for one spot to compare kickers on your team. Supported Sleeper scoring includes made kicks, distance bands, missed kicks including blocks, and field-goal yardage. Supported Yahoo made-kick distance bands and extra points also work. Sidekick shows league-scored history, kick attempts and a simple weekly scoring baseline. Draft and trade estimates can also use a kicker’s prior history and future scheduled games after the same historical testing used for other positions. Weather, coaching decisions, job changes and future availability remain unknown. Unrecognized rules or missing kick distances withhold automatic points; matching scoring-confirmed imports take priority. See the team-defense help answer for its separate scoring and data requirements.',
    action: { label: 'Compare kickers', section: 'Advice', adviceMode: 'lineup' },
  },
  {
    id: 'advice-start-sit',
    title: 'How do I compare players for one starting spot?',
    category: 'Advice',
    aliases:
      'start sit bench receiver running back flex one spot compare players missing kicker defense lineup',
    answer:
      'In Advice, choose Set my lineup, then Compare players for one spot. Choose at least two players from your saved team who fit the same starting spot in your league. Sidekick compares their scoring-matched weekly estimates, matchup, availability and relevant news, with numbers for the alternatives. Missing estimates for unrelated players do not block this comparison. Missing evidence for a selected active player still prevents a supported choice. This does not fill the rest of your lineup: keep the chosen player out of other starting slots and check your remaining starters separately. My full starting lineup continues to check every starting slot.',
    action: { label: 'Compare start / sit', section: 'Advice', adviceMode: 'lineup' },
  },
  {
    id: 'advice',
    title: 'How do I get fantasy or betting advice?',
    category: 'Advice',
    aliases:
      'start sit lineup draft pre post trade waivers pickup bet props spread moneyline model intelligent analysis stats',
    answer:
      'Open Advice and choose your decision. Fantasy advice uses your connected league’s scoring, team and roster slots. Draft and trade comparisons can estimate points automatically from public NFL stats and scheduled games when identity, scoring and history are supported. Matching scoring-confirmed imports take priority. Trades count only remaining games from the current week through your chosen final week; already-earned points are excluded. Automatic estimates assume recorded role and participation continue, with historical error ranges and test results shown beside the estimate. For bets, choose an upcoming NFL game, fetch sportsbook prices and choose Use this price, or enter the line and American odds yourself. Analyze uses your selected existing AI connection for an analysis and a review; provider usage limits and billing apply. Choose the saved service or an installed signed-in Claude or Codex CLI. It needs no new key and never submits roster changes or bets. Results are saved locally with supporting numbers, risks, source dates and model usage.',
    action: { label: 'Open Advice', section: 'Advice' },
  },
  {
    id: 'advice-automatic-projections',
    title: 'Can I get draft and trade estimates without importing a file?',
    category: 'Advice',
    aliases:
      'automatic draft trade forecast projections public stats numbers workload opponents historical range no import file',
    answer:
      'Yes. Sidekick projects every week itself from public NFL statistics, snap counts and depth charts, scored with your league’s rules; it does not use ESPN or other publishers’ projections. Rookies need three NFL games first. For longer intervals it sums exact future weeks instead of prorating a season total, and a historical estimate needs enough prior games. It tests scoring-form, workload and opponent adjustments using only earlier weeks, and keeps a simple scoring baseline when the adjustments lack support. Player details show the baseline, each adjustment, scheduled future games, historical error range and evaluation results. Matching scoring-confirmed imports take priority. Automatic estimates assume recorded role and participation continue; future injuries, missed appearances and role changes remain uncertain. A full-season estimate during the season includes recorded points and cannot grade what was knowable at the draft. Trade estimates exclude played games. Treat these comparisons as tentative; neither the range nor evidence confidence is a chance of winning.',
    action: { label: 'Open Advice', section: 'Advice' },
  },
  {
    id: 'advice-trade-projections',
    title: 'How are remaining-season trade points estimated?',
    category: 'Advice',
    aliases:
      'trade future remaining season projections csv import past earned points last week playoffs championship',
    answer:
      'A full-season total includes points from games already played. Those points cannot help the team receiving a player now. In Advice, choose the last NFL week that matters for your league. Sidekick estimates remaining points using prior scoring, workload and opponent history with the unplayed NFL schedule. Byes and played games are excluded. It tests its scoring adjustments on later historical weeks and uses a simple baseline when the adjustments lack support. These are conditional estimates, not player-availability forecasts or guaranteed season ranges. Matching imports take priority and help when automatic history, identity or scoring coverage is missing. Import scoring-matched projections for the current NFL week through that same final week. The CSV needs player, projectedPoints, season, fromWeek and throughWeek; leave week blank. For example, if the current week is 5 and your championship ends in week 17, use fromWeek 5 and throughWeek 17. Sidekick checks the season and interval before comparing starting-slot value. It does not subtract past scores from a full-season forecast or treat missing estimates as zero. If both matching imports and supported automatic estimates are missing, it explains the gap instead of giving a supported trade pick. Imported forecast accuracy is not independently verified; confirm that the source still includes only the remaining games you intend.',
    action: { label: 'Import projections', section: 'Imports' },
  },
  {
    id: 'advice-signed-in-ai',
    title: 'Can advice use my signed-in Claude without an API key?',
    category: 'Advice',
    aliases: 'claude opus subscription signed in login existing ai no new api key connection test',
    answer:
      'Yes, if the Claude CLI is already installed and signed in with your Claude subscription on this computer. In Advice, choose Signed-in Claude · Opus under AI connection. Reload connections checks sign-in without generating an answer. Test signed-in AI sends only a fixed connection check, with no league data. Analyze sends the decision and its evidence to Claude for an analysis and review using Opus. Subscription limits and model availability still apply; a successful sign-in check alone does not prove generation will work. This choice does not change report or schedule settings, create a key, or switch to another provider after a failure. You can cancel the test or analysis. Saved advice shows the connection used.',
    action: { label: 'Open Advice', section: 'Advice' },
  },
  {
    id: 'advice-signed-in-codex',
    title: 'Can advice use my ChatGPT sign-in without an API key?',
    category: 'Advice',
    aliases:
      'codex chatgpt gpt sol subscription signed in login existing ai no new api key connection test token budget',
    answer:
      'Yes, through the experimental Signed-in Codex · GPT-6.1-Sol choice in Advice. The Codex CLI must already be installed and signed in using ChatGPT. This adapter supports codex-cli 0.162.0-alpha.2 and, on macOS, 0.162.0-alpha.17.2. Other versions remain unavailable until their isolation is verified. Reload connections checks login without generating. Test signed-in AI sends a fixed check with no league data. Analyze sends only the selected decision evidence and note for an analysis and review with high reasoning. Local tools, project instructions, installed skills and app connectors are disabled. No new API key is created. Subscription limits apply; this connection cannot enforce a token budget per pass. Time and response-size limits still apply, and you can cancel. Sign-in does not guarantee model availability. Failures do not switch providers or alter report and schedule settings. Saved results identify the connection. This local connection has not been verified for every operating system or as a hosted service.',
    action: { label: 'Open Advice', section: 'Advice' },
  },
  {
    id: 'advice-confidence',
    title: 'Does an advice confidence score mean I will win?',
    category: 'Advice',
    aliases:
      'confidence probability accuracy odds evidence quality uncertainty forecast betting historical rate',
    answer:
      'No. Evidence confidence measures coverage, freshness, samples, source independence and the decision margin. It is not your chance of winning. Historical hit rates describe prior samples. The rolling statistical betting forecast separately tests predictions on later games and compares probability errors with the sportsbook baseline when paired prices and enough history are available. Legacy scores-only and player-prop fallbacks have separate limits. Its band describes earlier similar estimates; it does not guarantee this game or prove betting profit. The AI’s own win-probability guess is uncalibrated, so it is kept for research and not shown. Missing projections, unsupported scoring, ambiguous players and uncertain injury data can prevent a reliable recommendation. Check the supporting numbers and data gaps before acting.',
    action: { label: 'Open Advice', section: 'Advice' },
  },
  {
    id: 'advice-perception',
    title: 'How does advice use public sentiment?',
    category: 'Advice',
    aliases: 'public opinion sentiment perception news headlines sleeper trending adds drops hype',
    answer:
      'Advice selects recent headlines about the players and teams being compared, with publication dates and links. Team stories are labeled separately from player mentions. Without current cited headlines, media tone stays unknown; missing coverage is not neutral or negative sentiment. Matched Sleeper add/drop activity can also appear for Yahoo, ESPN and player props when the player can be identified. These limited samples do not represent everyone’s opinion or forecast player success. Football statistics, estimates, availability and legal roster consequences remain separate evidence.',
    action: { label: 'Open Advice', section: 'Advice' },
  },
  {
    id: 'getting-started',
    title: 'How do I get started?',
    category: 'Getting started',
    aliases: 'first report setup beginner tutorial league link',
    answer:
      'Try a sample league first, or choose Guided setup on Home. Connect your league, connect the AI service, then create a draft. You can finish setup later; completed connections are remembered. Voice, schedules, and delivery are optional.',
    action: { label: 'Open Home', section: 'League desk' },
  },
  {
    id: 'sample',
    title: 'Can I try Sidekick without an account?',
    category: 'Getting started',
    aliases: 'demo sample league free preview no account api key',
    answer:
      'Yes. Try a sample league uses fictional teams and prewritten reports. You can choose a report, edit it, and copy or download it. Sample mode never connects accounts, calls an AI service, schedules real reports, or sends messages.',
  },
  {
    id: 'league-link',
    title: 'Where can I find my league link?',
    category: 'Connections',
    aliases: 'connect sleeper espn yahoo url id league address invitation',
    answer:
      'Open your fantasy league in a browser and copy the address of its league home page. Paste that into Connect a league. Sidekick recognizes supported Sleeper, ESPN, and Yahoo league links. Invite links are different: use the league home page. If you have only an ID, choose your platform first.',
    action: { label: 'Manage leagues', section: 'Leagues' },
  },
  {
    id: 'ai-billing',
    title: 'Does my ChatGPT subscription include report writing?',
    category: 'Connections',
    aliases: 'ai openai key billing subscription cost payment credits model managed hosted',
    answer:
      'OpenAI API billing is separate from a ChatGPT subscription. Guided setup needs an API key from your own OpenAI account with API billing enabled. Existing alternative services and local tools are available under Advanced AI options. Sidekick does not currently provide a managed AI account or subscription. Advice has a separate experimental signed-in Codex choice that can use an existing ChatGPT login without a new key; it does not change report writing or schedule settings. Search for “Codex subscription” for that guide. Sample mode requires no key.',
    action: { label: 'Check AI connection', section: 'Settings', settingId: 'ai-runtime' },
  },
  {
    id: 'private-league',
    title: 'Why does my private league need extra access?',
    category: 'Connections',
    aliases: 'espn cookies espn_s2 swid yahoo oauth private permission login access denied',
    answer:
      'Private leagues require authorization from their platform. ESPN may need your own session values; Yahoo needs its developer-app setup and owner authorization. Open Delivery & access in Settings for the platform instructions. Never share these values in messages or screenshots. Saved credentials stay in this computer’s secure credential store.',
    action: { label: 'Open ESPN access', section: 'Settings', settingId: 'credential-espn' },
  },
  {
    id: 'share',
    title: 'How can I share a report with my group chat?',
    category: 'Reports & sharing',
    aliases: 'copy download export share paste whatsapp discord group chat message delivery setup',
    answer:
      'Open a saved report and choose Copy report or Download report. Paste the text into your group chat yourself. Share is also available when your browser or device supports it. These actions do not mark the report as sent or use a delivery provider. Save edits first so you share the version you reviewed.',
    action: { label: 'Open reports', section: 'Reports' },
  },
  {
    id: 'delivery',
    title: 'Why did my report not send?',
    category: 'Reports & sharing',
    aliases:
      'didnt send did not send failed missing email delivery blocked recipient timeout unknown uncertain retry',
    answer:
      'Creating a report saves a draft; it does not send it. Open Reports, review the draft, and check its channel and recipient. Save edits before sending. If delivery failed, inspect the attempt and follow its recovery action. Delivery unknown means the provider may already have sent it: check provider history before retrying to avoid a duplicate. Manual copying does not appear as a provider send.',
    action: { label: 'Check report attempts', section: 'Reports' },
  },
  {
    id: 'automation',
    title: 'How do I stop automatic messages?',
    category: 'Schedules',
    aliases: 'stop sending emails turn off automatic delivery dont send disable pause automation',
    answer:
      'Search for “stop sending emails” to review the affected report schedules, or edit a schedule and choose Review before send. Scheduled drafts can still be created for review. For automatic chat replies, turn off automatic sending in Delivery & access. Nothing changes until you confirm and save.',
    action: { label: 'Review schedules', section: 'Schedule' },
  },
  {
    id: 'schedule',
    title: 'Will schedules run when the app is closed?',
    category: 'Schedules',
    aliases:
      'next report when schedule computer sleeping stopped background tray missed time timezone',
    answer:
      'The local service must be running and your computer awake at the scheduled time. Closing the desktop window can keep the service running in the system tray when background mode is enabled; Stop app shuts it down. The displayed next run is a planned time, not a guarantee: league season, data freshness, and connection readiness can prevent creation. Missed recurring reports are not silently sent later.',
    action: { label: 'Open Schedule', section: 'Schedule' },
  },
  {
    id: 'voice',
    title: 'How do I make reports shorter or friendlier?',
    category: 'Personalization',
    aliases: 'tone style friendly funny profanity swearing length brief shorter writing preview',
    answer:
      'Choose Voice in Settings. Pick a starting style, check its illustrative example, and choose report length or topics to avoid. Save the changes. These choices affect newly generated reports; they do not rewrite existing saved drafts.',
    action: { label: 'Customize writing', section: 'Settings', settingId: 'writing-style' },
  },
  {
    id: 'privacy',
    title: 'What data is shared with the AI service?',
    category: 'Privacy & recovery',
    aliases: 'privacy secrets data ai provider memory messages credentials secure local',
    answer:
      'Report creation shares the league context needed for that report with your selected AI service. Member context and imported-message analysis have separate consent controls. Connection tests send a fixed test without league data. Credentials are stored separately in the OS credential store and are not included in ordinary exports. Copying or sharing a report gives its text to the destination you choose.',
    action: { label: 'Review privacy choices', section: 'Settings', settingId: 'member-memory' },
  },
  {
    id: 'recovery',
    title: 'How do I recover data or get help with an error?',
    category: 'Privacy & recovery',
    aliases: 'help support faq error broken troubleshooting recover backup restore diagnostics',
    answer:
      'Open Settings → Storage & desktop for encrypted backups and the troubleshooting summary. Error messages include a recovery action and expandable Details for support. Do not include API keys, passwords, or private session values when asking for help. Restoring a backup replaces local data, so review its confirmation carefully.',
    action: { label: 'Open troubleshooting', section: 'Settings', settingId: 'diagnostics' },
  },
] as const;
export function helpArticle(id: string) {
  return helpArticles.find((article) => article.id === id);
}
