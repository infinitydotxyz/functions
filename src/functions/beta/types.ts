export interface Referral {
  referee: {
    address: string;
  };
  referer: {
    address: string;
    code: string;
  };
  createdAt: number;
  processed: boolean;
}

export interface ReferralCode {
  referralCode: string;
  createdAt: number;
  owner: {
    address: string;
  };
  isValid: boolean;
}

export interface ReferralRewards {
  numberOfReferrals: number;
}
