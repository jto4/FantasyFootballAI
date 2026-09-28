/** Match direct agent mentions without treating ordinary chat or quoted text as a request. */
export function isDirectChatMention(message: string, agentName: string): boolean {
  const name = agentName.trim();
  if (!name || name.length > 60 || message.length > 20_000) return false;

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const mention = new RegExp(`^(?:@${escapedName}|${escapedName})(?=$|[\\s,:!?])`, 'i');
  const firstLine = message.split(/\r?\n/, 1)[0] ?? '';
  return mention.test(firstLine.trimStart());
}
