const formatters = new Map<number, Intl.NumberFormat>();

/** A number in the viewer's locale, with at most this many decimals. */
export function formatNumber(value: number, digits = 1) {
  let formatter = formatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: digits });
    formatters.set(digits, formatter);
  }
  return formatter.format(value);
}

/** The same, with a dash for a number we don't have. */
export const formatOptional = (value: number | undefined, digits = 1) =>
  value === undefined ? '—' : formatNumber(value, digits);
