import type { LeagueConnector, Platform } from '@sidekick/core';
import { EspnConnector } from './espn.js';
import { SleeperConnector } from './sleeper.js';
import { YahooConnector } from './yahoo.js';

export { EspnConnector } from './espn.js';
export { SleeperConnector, SleeperPlayerCatalog } from './sleeper.js';
export { YahooConnector } from './yahoo.js';

export function connectorFor(
  platform: Platform,
  credential?: string,
  season?: number,
): LeagueConnector {
  if (platform === 'sleeper') return new SleeperConnector();
  if (platform === 'espn') return new EspnConnector(credential, season);
  return new YahooConnector(credential);
}
