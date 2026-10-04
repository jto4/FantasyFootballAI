/** Keep imported/provider content inside data-only prompt sections without forgeable XML tags. */
export function promptDataBlock(name: string, value: unknown): string {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(name))
    throw new Error('Prompt data block names must be lowercase labels.');
  const serialized = JSON.stringify(value) ?? 'null';
  // Escaping markup prevents untrusted content from closing its enclosing data section.
  const safeJson = serialized.replace(/[<>&]/g, (character) => {
    if (character === '<') return '\\u003c';
    if (character === '>') return '\\u003e';
    return '\\u0026';
  });
  if (Buffer.byteLength(safeJson, 'utf8') > 96_000)
    throw new Error('Prompt data exceeds the 96 KB limit.');
  return `<${name}>\n${safeJson}\n</${name}>`;
}
