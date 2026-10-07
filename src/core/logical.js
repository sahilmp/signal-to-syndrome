// Logical decision: the decoder's flip corrects the raw readout of data qubit 0.

export function correctedLogical(xHat0, flip) {
  return (xHat0 ^ flip) & 1;
}

export function isLogicalError(corrected, logical) {
  return ((corrected ^ logical) & 1) === 1;
}
