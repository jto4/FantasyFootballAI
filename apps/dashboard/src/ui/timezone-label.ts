const labels: Record<string, string> = {
  'America/New_York': 'Eastern Time — New York',
  'America/Chicago': 'Central Time — Chicago',
  'America/Denver': 'Mountain Time — Denver',
  'America/Los_Angeles': 'Pacific Time — Los Angeles',
  UTC: 'UTC — Universal Time',
};

export function timezoneLabel(timezone: string): string {
  return (
    labels[timezone] ??
    `Local time — ${timezone.split('/').at(-1)?.replaceAll('_', ' ') || timezone}`
  );
}
