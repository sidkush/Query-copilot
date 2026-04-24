import React from 'react';

/**
 * Phase L — ClaimChip. Renders measured/unverified numeric claim chip.
 * Props: value: string|number, verified: boolean, queryId: string|null
 */
export default function ClaimChip({ value, verified, queryId }) {
  const label = verified ? 'measured' : 'unverified';
  const cls = verified ? 'claim-chip claim-chip--measured' : 'claim-chip claim-chip--unverified';
  const title = verified
    ? `Measured from query ${queryId}`
    : 'Not matched to any executed query — treat as LLM inference.';
  return (
    <span className={cls} title={title}>
      <span className="claim-chip__value">{value}</span>
      <span className="claim-chip__label">{label}</span>
    </span>
  );
}
