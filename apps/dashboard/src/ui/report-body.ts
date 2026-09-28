import type { SavedReport } from '@sidekick/core';

export type ReportBodyPart =
  { kind: 'text'; value: string } | { kind: 'citation'; title: string; url: string };

/** Split only verified citation links; leave all other model-authored markup as plain text. */
export function reportBodyParts(
  body: string,
  citations: SavedReport['citations'],
): ReportBodyPart[] {
  const links = [
    ...new Map(
      citations.map((citation) => [`[${citation.title}](${citation.url})`, citation]),
    ).entries(),
  ]
    .filter(([markdown]) => markdown.length > 4)
    .sort(([left], [right]) => right.length - left.length);
  const parts: ReportBodyPart[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    let nextIndex = -1;
    let nextMarkdown = '';
    let nextCitation: SavedReport['citations'][number] | undefined;
    for (const [markdown, citation] of links) {
      const index = body.indexOf(markdown, cursor);
      if (index >= 0 && (nextIndex < 0 || index < nextIndex)) {
        nextIndex = index;
        nextMarkdown = markdown;
        nextCitation = citation;
      }
    }
    if (nextIndex < 0 || !nextCitation) break;
    if (nextIndex > cursor) parts.push({ kind: 'text', value: body.slice(cursor, nextIndex) });
    parts.push({ kind: 'citation', title: nextCitation.title, url: nextCitation.url });
    cursor = nextIndex + nextMarkdown.length;
  }

  if (cursor < body.length || parts.length === 0)
    parts.push({ kind: 'text', value: body.slice(cursor) });
  return parts;
}
