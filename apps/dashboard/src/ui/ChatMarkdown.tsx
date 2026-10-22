import { Fragment, type ReactNode } from 'react';

/** Bold, inline code and https links; everything else stays plain text (no HTML is injected). */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const key = `${match.index}`;
    if (match[1]) parts.push(<strong key={key}>{match[1]}</strong>);
    else if (match[2]) parts.push(<code key={key}>{match[2]}</code>);
    else
      parts.push(
        <a key={key} href={match[4]} target="_blank" rel="noreferrer noopener">
          {match[3]}
        </a>,
      );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** A small Markdown subset for chat answers: headings, lists, simple tables and paragraphs. */
export function ChatMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | undefined;
  let paragraph: string[] = [];
  let table: string[][] = [];
  const cells = (line: string) =>
    line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim());
  const flush = () => {
    if (table.length) {
      const [head, ...rows] = table;
      blocks.push(
        <div className="chat-table" key={blocks.length}>
          <table>
            <thead>
              <tr>
                {head!.map((cell, i) => (
                  <th key={i}>{inline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    }
    table = [];
    if (paragraph.length) blocks.push(<p key={blocks.length}>{inline(paragraph.join(' '))}</p>);
    paragraph = [];
    if (list) {
      const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
      blocks.push(
        list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>,
      );
    }
    list = undefined;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    const tableRow = /^\|.*\|$/.test(line);
    if (table.length && !tableRow) flush();
    if (!line) flush();
    else if (tableRow) {
      if (!table.length) flush();
      // The |---|---| divider row only marks the header; it isn't shown.
      if (!/^\|[\s:|-]+\|$/.test(line)) table.push(cells(line));
    } else if (heading) {
      flush();
      blocks.push(<h4 key={blocks.length}>{inline(heading[1]!)}</h4>);
    } else if (bullet || numbered) {
      if (paragraph.length || (list && list.ordered !== Boolean(numbered))) flush();
      list ??= { ordered: Boolean(numbered), items: [] };
      list.items.push((bullet ?? numbered)![1]!);
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return <Fragment>{blocks}</Fragment>;
}
