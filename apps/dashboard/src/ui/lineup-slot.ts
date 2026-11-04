const names: Record<string, string> = {
  QB: 'Quarterback',
  RB: 'Running back',
  WR: 'Wide receiver',
  TE: 'Tight end',
  K: 'Kicker',
  DST: 'Team defense',
  DEF: 'Team defense',
  FLEX: 'Flex',
  FLX: 'Flex',
  WRT: 'Flex',
  RECFLEX: 'Receiver flex',
  WRRBFLEX: 'Running back / receiver flex',
  SUPERFLEX: 'Superflex',
  OP: 'Superflex',
  WRTQB: 'Superflex',
  QBRBWRTE: 'Superflex',
};

/** A readable slot name: the optimizer's "DST 7" carries a list index nobody should see. */
export function lineupSlotName(slot: string) {
  const position = slot.replace(/ \d+$/, '');
  return Object.hasOwn(names, position) ? names[position]! : position;
}
