/** Strict CSV state machine: bounded cells/rows, quoted commas/newlines, no malformed quoting. */
export function csvRecords(input: string, required: readonly string[]): Record<string, string>[] {
  if (input.length > 12_000_000) throw new Error('Public football CSV exceeded its limit.');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    state: 'plain' | 'quoted' | 'closed' = 'plain';
  const finishCell = () => {
    row.push(cell);
    cell = '';
    state = 'plain';
    if (row.length > 200) throw new Error('Too many CSV columns.');
  };
  const finishRow = () => {
    finishCell();
    if (row.some((value) => value)) rows.push(row);
    row = [];
    if (rows.length > 30_000) throw new Error('Too many CSV rows.');
  };
  const text = input.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (state === 'quoted') {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index++;
        } else state = 'closed';
      } else cell += character;
    } else if (character === ',') finishCell();
    else if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      finishRow();
    } else if (state === 'closed') throw new Error('Malformed CSV quoting.');
    else if (character === '"') {
      if (cell.length) throw new Error('Malformed CSV quoting.');
      state = 'quoted';
    } else cell += character;
    if (cell.length > 4_096) throw new Error('CSV cell exceeded its limit.');
  }
  if (state === 'quoted') throw new Error('Unclosed CSV quote.');
  if (cell.length || row.length || state === 'closed') finishRow();
  const headers = rows.shift();
  if (
    !headers ||
    new Set(headers).size !== headers.length ||
    required.some((key) => !headers.includes(key))
  )
    throw new Error('Unexpected public football CSV schema.');
  return rows.map((values) => {
    if (values.length !== headers.length) throw new Error('Invalid public football CSV row width.');
    return Object.fromEntries(headers.map((key, index) => [key, values[index]!]));
  });
}
