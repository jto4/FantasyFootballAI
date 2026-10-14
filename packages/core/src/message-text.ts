import type { ActionSetting } from './domain-types.js';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Preserve existing UTF-16 limits without cutting a user-visible character in half. */
export function deliveryText(
  body: string,
  channel: ActionSetting['channel'],
  destination: string,
): string {
  const limit =
    channel === 'sms'
      ? /^CH[0-9a-fA-F]{32}$/.test(destination)
        ? 1600
        : 1500
      : channel === 'imessage'
        ? 10000
        : body.length;
  if (body.length <= limit) return body;
  let end = 0;
  for (const part of graphemes.segment(body)) {
    const next = part.index + part.segment.length;
    if (next > limit) break;
    end = next;
  }
  return body.slice(0, end);
}
