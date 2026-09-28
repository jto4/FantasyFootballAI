/** Restrict Message-ID values before placing them in the outgoing In-Reply-To header. */
export function isValidMessageId(value: string): boolean {
  const id = value.startsWith('<') && value.endsWith('>') ? value.slice(1, -1) : value;
  return value.length <= 998 && id.length > 2 && !/[\x00-\x20\x7f<>]/.test(id) && id.includes('@');
}

export function isValidEmailSubject(value: string): boolean {
  return value.length > 0 && value.length <= 200 && !/[\r\n\x00]/.test(value);
}
