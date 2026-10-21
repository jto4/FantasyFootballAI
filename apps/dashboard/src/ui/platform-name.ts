const platformNames: Record<string, string> = { espn: 'ESPN', yahoo: 'Yahoo', sleeper: 'Sleeper' };

/** Display name for a fantasy platform id (ESPN, not Espn). */
export function platformName(platform: string) {
  return platformNames[platform] ?? capitalize(platform);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
