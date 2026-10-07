import META from "@src/bank/meta.json" with { type: "json" };

/** Vouch tiers by absolute delta; see `vouchThresholds` in meta.json */
const VOUCH_THRESHOLDS = META.vouchThresholds;

/**
 * The number of vouches a mint of `delta` MPs needs before it is applied.
 * The creator's implicit vouch counts towards this only when they are a
 * third party to the transaction.
 */
export const calculateRequiredVouches = (delta: number): number =>
  VOUCH_THRESHOLDS
    .filter(({ minAbsDelta }) => Math.abs(delta) >= minAbsDelta)
    .reduce((max, { requiredVouches }) => Math.max(max, requiredVouches), 0);
