import type { SearchItem } from './search-catalog';

const filler = new Set(
  'a an the i my me we our you your how where can could would should do does is are to for with of and please find show help like change set turn make on off stop want need not dont doesnt cant cannot use setting settings'.split(
    ' ',
  ),
);
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function words(value: string) {
  return normalizeSearch(value).split(' ').filter(Boolean);
}
export function searchTerms(query: string): string[] {
  return [...new Set(words(query.slice(0, 120)).filter((token) => !filler.has(token)))].slice(
    0,
    12,
  );
}
// Adjacent transpositions count as one typo; restrict fuzzy matches to meaningful-length words.
function typoDistance(left: string, right: string): number {
  if (Math.abs(left.length - right.length) > 1) return 2;
  const rows = Array.from({ length: left.length + 1 }, (_, i) => [i]);
  rows[0] = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++)
    for (let j = 1; j <= right.length; j++) {
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1])
        rows[i]![j] = Math.min(rows[i]![j]!, rows[i - 2]![j - 2]! + 1);
    }
  return rows[left.length]![right.length]!;
}
export function searchItems(query: string, items: SearchItem[], limit = 10): SearchItem[] {
  const normalized = normalizeSearch(query.slice(0, 120));
  const tokens = searchTerms(normalized);
  if (!tokens.length) {
    if (!normalized) return [];
    return items.filter((item) => normalizeSearch(item.title).includes(normalized)).slice(0, limit);
  }
  return items
    .map((item) => {
      const fields = [
        [item.title, 8],
        [item.aliases, 7],
        [item.location, 3],
        [item.description, 1],
      ] as const;
      const lexicon = fields.flatMap(([text, weight]) =>
        words(text).map((word) => ({ word, weight })),
      );
      let score = 0;
      for (const token of tokens) {
        let best = 0;
        for (const { word, weight } of lexicon) {
          if (word === token) best = Math.max(best, weight * 5);
          else if (token.length >= 2 && word.startsWith(token)) best = Math.max(best, weight * 3);
          else if (
            token.length >= 4 &&
            word.length >= 4 &&
            token.length <= 40 &&
            word.length <= 40 &&
            typoDistance(token, word) === 1
          )
            best = Math.max(best, weight);
        }
        if (!best) return { item, score: 0 };
        score += best;
      }
      if (normalizeSearch(item.title) === normalized) score += 100;
      else if (normalizeSearch(item.title).includes(normalized)) score += 45;
      if (normalizeSearch(item.aliases).includes(normalized)) score += 30;
      if (item.kind === 'Help' && normalizeSearch(item.title) !== normalized) score *= 0.5;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map(({ item }) => item);
}
