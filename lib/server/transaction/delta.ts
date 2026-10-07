/**
 * Whether `delta` can be the MP amount of a transaction: a non-zero integer.
 * Rejects `NaN`, so a failed `parseInt` needs no separate check.
 */
export const isValidDelta = (delta: number): boolean =>
  Number.isInteger(delta) && delta !== 0;
