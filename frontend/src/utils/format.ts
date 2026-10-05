// Points <-> Rupees. Exchange ratio: 1000 points = ₹1.
export const POINTS_PER_RUPEE = 1000;
export const MIN_WITHDRAW_RUPEES = 20;

export function pointsToRupees(points: number): number {
  return points / POINTS_PER_RUPEE;
}

export function rupeesToPoints(rupees: number): number {
  return Math.round(rupees * POINTS_PER_RUPEE);
}

export function formatRupees(rupees: number): string {
  const rounded = Math.round(rupees * 100) / 100;
  const isWhole = Number.isInteger(rounded);
  return `₹${isWhole ? rounded.toString() : rounded.toFixed(2)}`;
}

export function formatPoints(points: number): string {
  return points.toLocaleString("en-IN");
}
