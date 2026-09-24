// Always two decimals with thousands separators — add-on prices can make a
// total fractional, and raw numbers print float noise (or "฿45.5.00" when a
// caller appends ".00" itself).
export const formatBaht = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
