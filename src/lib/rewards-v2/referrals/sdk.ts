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

export type RewardsEvent = ReferralEvent;

export interface UserRewardEvent {
  user: string;
  kind: 'referral' | 'airdrop' | 'listing' | 'buy';
  blockNumber: number;
  balance: string;
  bonusMultiplier: number;
  preBonusPoints: number;
  totalPoints: number;
  timestamp: number;
  processed: boolean;
}

export type UserRewards = {
  referralPoints: number;
  listingPoints: number;
  airdropPoints: number;
  buyPoints: number;
  totalPoints: number;
  updatedAt: number;
  user: string;
};

export interface Referral {
  user: string;
  referrer: string;
  referrerXFLBalance: string;
  kind: 'primary' | 'secondary' | 'tertiary';
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

export const getUserReferrers = async (firestore: FirebaseFirestore.Firestore, user: string) => {
  const userReferralsRef = firestore
    .collection('pixl')
    .doc('pixlReferrals')
    .collection('pixlUserReferrals') as FirebaseFirestore.CollectionReference<Referral>;
  const referrersQuery = userReferralsRef.where('user', '==', user);
  const referrersSnap = await referrersQuery.get();

  return referrersSnap.docs
    .map((doc) => doc.data())
    .reduce(
      (acc: Record<Referral['kind'], string | null>, curr) => {
        switch (curr.kind) {
          case 'primary':
            return { ...acc, primary: curr.referrer };
          case 'secondary':
            return { ...acc, secondary: curr.referrer };
          case 'tertiary':
            return { ...acc, tertiary: curr.referrer };
        }
      },
      {
        primary: null,
        secondary: null,
        tertiary: null
      }
    );
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

export const getUserRewards = async (firestore: FirebaseFirestore.Firestore, user: string) => {
  const userRewardsRef = firestore
    .collection('pixl')
    .doc('pixlRewards')
    .collection('pixlUserRewards')
    .doc(user) as FirebaseFirestore.DocumentReference<UserRewards>;

  const userRewardsSnap = await userRewardsRef.get();
  const userRewards = userRewardsSnap.data();
  if (!userRewards) {
    return {
      referralPoints: 0,
      listingPoints: 0,
      airdropPoints: 0,
      buyPoints: 0,
      totalPoints: 0,
      updatedAt: Date.now(),
      user
    };
  }
  return userRewards;
};
