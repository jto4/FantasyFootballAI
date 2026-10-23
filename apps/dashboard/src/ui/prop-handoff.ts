import type { PropHandoff } from './PropsBoard';

// Carries a prop picked on the board into the bet form when switching Advice to betting mode,
// which remounts the page. Cleared once the form has applied it.
let pending: PropHandoff | undefined;
export const stashPropHandoff = (pick: PropHandoff) => {
  pending = pick;
};
export const peekPropHandoff = () => pending;
export const clearPropHandoff = () => {
  pending = undefined;
};
