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

export const isNativeBuy = (sale: { marketplace: string; fillSource: string }) => {
  return sale.marketplace === 'pixl.so';
};

export const isNativeFill = (sale: { marketplace: string; fillSource: string }) => {
  return sale.fillSource === 'pixl.so';
};

export interface BuyEvent {
  kind: 'BUY';
  isNativeBuy: boolean;
  isNativeFill: boolean;
  user: string;
  // ethereum block number
  blockNumber: number;
  chainId: string;
  sale: {
    // block number of the sale chain
    blockNumber: number;
    buyer: string;
    seller: string;
    txHash: string;
    logIndex: number;
    bundleIndex: number;
    fillSource: string;
    washTradingScore: number;
    marketplace: string;
    marketplaceAddress: string;
    quantity: string;
    collectionAddress: string;
    tokenId: string;
    saleTimestamp: number;
    salePriceUsd: number;
  };
  processed: boolean;
  timestamp: number;
}

export type RewardsEvent = BuyEvent | ReferralEvent | AirdropEvent | AirdropBoostEvent;

export interface UserBuyRewardEvent {
  user: string;
  chainId: string;
  isNativeBuy: boolean;
  isNativeFill: boolean;
  sale: {
    // block number of the sale chain
    blockNumber: number;
    buyer: string;
    seller: string;
    txHash: string;
    logIndex: number;
    bundleIndex: number;
    fillSource: string;
    washTradingScore: number;
    marketplace: string;
    marketplaceAddress: string;
    quantity: string;
    collectionAddress: string;
    tokenId: string;
    saleTimestamp: number;
    salePriceUsd: number;
  };
  kind: 'buy';
  // ethereum block number
  blockNumber: number;
  balance: string;
  bonusMultiplier: number;
  preBonusPoints: number;
  totalPoints: number;
  timestamp: number;
  processed: boolean;
}

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

export type UserRewardEvent =
  | UserBuyRewardEvent
  | UserReferralRewardEvent
  | UserAirdropRewardEvent
  | UserAirdropBoostEvent;

export type UserRewards = {
  referralPoints: number;
  listingPoints: number;
  airdropTier: AirdropTier;
  buyPoints: number;
  totalPoints: number;
  updatedAt: number;
  user: string;
  airdropBoosted: boolean;
  numReferrals: number;
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
        numReferrals: 0,
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
      airdropBoosted: userRewards.airdropBoosted || false,
      numReferrals: userRewards.numReferrals || 0
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

export function formatDay(date: Date | number): string {
  date = typeof date === 'number' ? new Date(date) : date;
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDay(day: string) {
  const [year, month, date] = day.split('-');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(date)).getTime();
}

export type SalesStatsKind = 'USER' | 'CHAIN_USER' | 'CHAIN' | 'TOTAL';

interface SaleStats {
  numBuys: number;
  numNativeBuys: number;
  volume: number;
  nativeVolume: number;
}

export interface ChainStats extends SaleStats {
  kind: 'CHAIN';
  chainId: string;
}

export interface UserStats extends SaleStats {
  kind: 'USER';
  user: string;
}

export interface ChainUserStats extends SaleStats {
  kind: 'CHAIN_USER';
  user: string;
  chainId: string;
}

export interface TotalStats extends SaleStats {
  kind: 'TOTAL';
}

export interface DailyChainStats extends ChainStats {
  day: string;
  timestamp: number;
}

export interface DailyUserStats extends UserStats {
  day: string;
  timestamp: number;
}

export interface DailyChainUserStats extends ChainUserStats {
  day: string;
  timestamp: number;
}

export interface DailyTotalStats extends TotalStats {
  day: string;
  timestamp: number;
}

export type DailyStats = DailyChainStats | DailyUserStats | DailyChainUserStats | DailyTotalStats;

export type SalesStats = ChainStats | UserStats | ChainUserStats | TotalStats | DailyStats;

export function isDaily(item: SalesStats): item is DailyStats {
  return 'day' in item;
}

export const getDefaultTotalStats = (): TotalStats => ({
  kind: 'TOTAL',
  numBuys: 0,
  numNativeBuys: 0,
  volume: 0,
  nativeVolume: 0
});

export const getDefaultChainStats = (chainId: string): ChainStats => ({
  kind: 'CHAIN',
  chainId,
  numBuys: 0,
  numNativeBuys: 0,
  volume: 0,
  nativeVolume: 0
});

export const getDefaultUserStats = (user: string): UserStats => ({
  kind: 'USER',
  user,
  numBuys: 0,
  numNativeBuys: 0,
  volume: 0,
  nativeVolume: 0
});

export const getDefaultChainUserStats = (data: { user: string; chainId: string }): ChainUserStats => ({
  kind: 'CHAIN_USER',
  user: data.user,
  chainId: data.chainId,
  numBuys: 0,
  numNativeBuys: 0,
  volume: 0,
  nativeVolume: 0
});

export const toDaily = <T extends ChainStats | UserStats | ChainUserStats | TotalStats>(
  timestamp: number,
  stats: T
): T & { day: string; timestamp: number } => {
  const day = formatDay(new Date(timestamp));
  const dayTimestamp = parseDay(day);

  return {
    ...stats,
    day,
    timestamp: dayTimestamp
  };
};

export const getSaleRefs = (
  db: FirebaseFirestore.Firestore,
  sale: { buyer: string; chainId: string; timestamp: number }
) => {
  const totalSales = db.collection('pixl').doc('salesCollections') as FirebaseFirestore.DocumentReference<TotalStats>;
  const chainSales = totalSales
    .collection('salesByChain')
    .doc(sale.chainId) as FirebaseFirestore.DocumentReference<ChainStats>;
  const userSales = totalSales
    .collection('salesByUser')
    .doc(sale.buyer) as FirebaseFirestore.DocumentReference<UserStats>;
  const chainUserSales = totalSales
    .collection('salesByChainUser')
    .doc(`${sale.chainId}:${sale.buyer}`) as FirebaseFirestore.DocumentReference<ChainUserStats>;
  const salesByDayRef = totalSales.collection('salesByDay') as FirebaseFirestore.CollectionReference<DailyStats>;

  const day = formatDay(new Date(sale.timestamp));
  const dailyChainSales = salesByDayRef.doc(
    `CHAIN:${sale.chainId}:date:${day}`
  ) as FirebaseFirestore.DocumentReference<DailyChainStats>;
  const dailyUserSales = salesByDayRef.doc(
    `USER:${sale.buyer}:date:${day}`
  ) as FirebaseFirestore.DocumentReference<DailyUserStats>;
  const dailyChainUserSales = salesByDayRef.doc(
    `CHAIN_USER:${sale.chainId}:${sale.buyer}:date:${day}`
  ) as FirebaseFirestore.DocumentReference<DailyChainUserStats>;
  const dailyTotalSales = salesByDayRef.doc(
    `TOTAL:date:${day}`
  ) as FirebaseFirestore.DocumentReference<DailyTotalStats>;

  return {
    chainSales,
    userSales,
    chainUserSales,
    totalSales,

    dailyChainSales,
    dailyChainUserSales,
    dailyTotalSales,
    dailyUserSales
  };
};
