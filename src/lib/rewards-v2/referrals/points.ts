const BASE_POINTS = 10000;

export const getReferralPoints = (index: number) => {
  return BASE_POINTS / (index + 1);
};
