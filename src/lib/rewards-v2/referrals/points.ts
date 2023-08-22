import { ReferralLevel } from './types';

const BasePoints = 100; // TODO UPDATE THIS

export const ReferralPoints = {
  primary: {
    base: BasePoints,
    multiplier: 3
  },
  secondary: {
    base: BasePoints,
    multiplier: 2
  },
  tertiary: {
    base: BasePoints,
    multiplier: 1
  }
};

export const getReferralPoints = (referralKind: ReferralLevel) => {
  return ReferralPoints[referralKind];
};

export const calcReferralPoints = (config: { base: number; multiplier: number }) => {
  return Math.round(config.base * config.multiplier);
};
