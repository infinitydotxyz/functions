interface ReferralCode {
  code: string;
  address: string;
  createdAt: number;
}

export interface ReferralEvent {
  kind: 'REFERRAL';
  referree: string;
  referrer: {
    code: string;
    address: string;
  };
  blockNumber: number;
  timestamp: number;
  processed: boolean;
}

export interface AirdropBoostEvent {
  kind: 'AIRDROP_BOOST';
  user: string;
  timestamp: number;
  processed: boolean;
}

export type AirdropTier = 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE' | 'NONE';

export interface AirdropEvent {
  kind: 'AIRDROP';
  user: string;
  tier: AirdropTier;
  timestamp: number;
  processed: boolean;
}

export type RewardsEvent = ReferralEvent | AirdropEvent | AirdropBoostEvent;

export interface UserReferralRewardEvent {
  user: string;
  kind: 'referral';
  blockNumber: number;
  balance: string;
  bonusMultiplier: number;
  preBonusPoints: number;
  totalPoints: number;
  timestamp: number;
  processed: boolean;
}

export interface UserAirdropRewardEvent {
  user: string;
  kind: 'airdrop';
  tier: AirdropTier;
  timestamp: number;
  processed: boolean;
}

export interface UserAirdropBoostEvent {
  user: string;
  kind: 'airdrop_boost';
  timestamp: number;
  processed: boolean;
}

export type UserRewardEvent = UserReferralRewardEvent | UserAirdropRewardEvent | UserAirdropBoostEvent;

export type UserRewards = {
  referralPoints: number;
  listingPoints: number;
  airdropTier: AirdropTier;
  buyPoints: number;
  totalPoints: number;
  updatedAt: number;
  user: string;
  airdropBoosted: boolean;
};

export interface Referral {
  user: string;
  referrer: string;
  referrerXFLBalance: string;
  // the referral index (i.e. referral depth)
  index: number;
  blockNumber: number;
  timestamp: number;
}

export const getUserByReferralCode = async (firestore: FirebaseFirestore.Firestore, referralCode: string) => {
  const referralCodesRef = firestore
    .collection('pixl')
    .doc('pixlReferrals')
    .collection('pixlReferralCodes') as FirebaseFirestore.CollectionReference<ReferralCode>;
  const referralCodeRef = referralCodesRef.doc(referralCode);
  const referralSnap = await referralCodeRef.get();
  const referralCodeData = referralSnap.data();
  if (!referralCodeData) {
    return { address: null };
  }

  return {
    address: referralCodeData.address
  };
};

export const saveRewardsEvent = async (firestore: FirebaseFirestore.Firestore, event: RewardsEvent) => {
  await firestore.collection('pixl').doc('pixlRewards').collection('pixlRewardEvents').doc().set(event);
};

export const saveReferrals = (
  firestore: FirebaseFirestore.Firestore,
  referrals: Referral[],
  batch: FirebaseFirestore.WriteBatch
): void => {
  const referrralsRef = firestore
    .collection('pixl')
    .doc('pixlReferrals')
    .collection('pixlUserReferrals') as FirebaseFirestore.CollectionReference<Referral>;
  referrals.forEach((referral) => {
    const referralRef = referrralsRef.doc(`${referral.user}:${referral.referrer}`);
    batch.create(referralRef, referral);
  });
};

export const saveUserRewardEvents = (
  firestore: FirebaseFirestore.Firestore,
  rewards: UserRewardEvent[],
  batch: FirebaseFirestore.WriteBatch
) => {
  for (const reward of rewards) {
    const rewardRef = firestore
      .collection('pixl')
      .doc('pixlRewards')
      .collection('pixlUserRewards')
      .doc(reward.user)
      .collection('pixlUserRewardsEvents');
    batch.set(rewardRef.doc(), reward);
  }
};

export const getUserReferrers = async (firestore: FirebaseFirestore.Firestore, user: string, limit: number) => {
  const userReferralsRef = firestore
    .collection('pixl')
    .doc('pixlReferrals')
    .collection('pixlUserReferrals') as FirebaseFirestore.CollectionReference<Referral>;
  const referrersQuery = userReferralsRef.where('user', '==', user).orderBy('index', 'asc').limit(limit);
  const referrersSnap = await referrersQuery.get();

  return referrersSnap.docs.map((doc) => doc.data()).sort((a, b) => a.index - b.index);
};

export const saveUserRewards = (
  firestore: FirebaseFirestore.Firestore,
  rewards: UserRewards,
  batch: FirebaseFirestore.WriteBatch
) => {
  const userRewardsRef = firestore
    .collection('pixl')
    .doc('pixlRewards')
    .collection('pixlUserRewards')
    .doc(rewards.user) as FirebaseFirestore.DocumentReference<UserRewards>;

  batch.set(userRewardsRef, rewards, { merge: true });
};

export const getUserRewards = async (
  firestore: FirebaseFirestore.Firestore,
  user: string,
  txn?: FirebaseFirestore.Transaction
): Promise<{ data: UserRewards; ref: FirebaseFirestore.DocumentReference<UserRewards> }> => {
  const userRewardsRef = firestore
    .collection('pixl')
    .doc('pixlRewards')
    .collection('pixlUserRewards')
    .doc(user) as FirebaseFirestore.DocumentReference<UserRewards>;

  const userRewardsSnap = txn ? await txn.get(userRewardsRef) : await userRewardsRef.get();
  const userRewards = userRewardsSnap.data();
  if (!userRewards) {
    return {
      data: {
        referralPoints: 0,
        listingPoints: 0,
        airdropTier: 'NONE',
        buyPoints: 0,
        totalPoints: 0,
        updatedAt: Date.now(),
        user,
        airdropBoosted: false
      },
      ref: userRewardsRef
    };
  }
  return {
    ref: userRewardsRef,
    data: {
      ...userRewards,
      airdropBoosted: userRewards.airdropBoosted || false
    }
  };
};

export const getAirdropTier = (base: AirdropTier, isBoosted: boolean): AirdropTier => {
  if (!isBoosted) {
    return base;
  }
  switch (base) {
    case 'NONE':
      return 'BRONZE';
    case 'BRONZE':
      return 'SILVER';
    case 'SILVER':
      return 'GOLD';
    case 'GOLD':
      return 'PLATINUM';
    case 'PLATINUM':
      return 'PLATINUM';
  }
};
