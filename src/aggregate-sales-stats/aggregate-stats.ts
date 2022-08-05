import {
  ChainId,
  ChangeInSalesStats,
  Collection,
  CollectionLinkData,
  CollectionSalesStats,
  CollectionStats,
  NftLinkData,
  NftStats,
  PrevBaseSalesStats,
  SocialsStats,
  Stats,
  StatsPeriod,
  Token
} from '@infinityxyz/lib/types/core';
import { NftImageDto } from '@infinityxyz/lib/types/dto/collections/nfts/nft-image.dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { SalesIntervalDoc, BaseStats, CurrentStats } from './types';
import {
  calcPercentChange,
  combineCurrentStats,
  getStatsDocInfo,
} from './utils';

export async function aggregateHourlyStats(
  timestamp: number,
  intervalRef: FirebaseFirestore.DocumentReference<SalesIntervalDoc>,
  statsCollection: FirebaseFirestore.CollectionReference
): Promise<BaseStats> {
  const period = getStatsDocInfo(timestamp, StatsPeriod.Hourly);
  const startTimestamp = period.timestamp;
  const oneHour = 60 * 1000 * 60;
  const endTimestamp = period.timestamp + oneHour;
  const salesIntervalsColl = intervalRef.parent;
  const snapshot = await salesIntervalsColl
    .where('startTimestamp', '>=', startTimestamp)
    .where('startTimestamp', '<', endTimestamp)
    .get();
  const statsForHour = snapshot.docs
    .map((item) => item.data())
    .filter((item) => !!item.stats)
    .map((item) => item.stats);
  const current = combineCurrentStats(statsForHour);
  const stats = await combineWithPrevStats(current, startTimestamp, StatsPeriod.Hourly, statsCollection);
  return stats;
}

export async function aggregateDailyStats(
  timestamp: number,
  statsCollection: FirebaseFirestore.CollectionReference
): Promise<BaseStats> {
  const period = getStatsDocInfo(timestamp, StatsPeriod.Daily);
  const startTimestamp = period.timestamp;
  const oneDay = 60 * 1000 * 60 * 24;
  const timestampInNextPeriod = period.timestamp + oneDay;
  const nextPeriod = getStatsDocInfo(timestampInNextPeriod, StatsPeriod.Daily);
  const nextPeriodTimestamp = nextPeriod.timestamp;

  const snapshot = await statsCollection
    .where('period', '==', StatsPeriod.Hourly)
    .where('timestamp', '>=', startTimestamp)
    .where('timestamp', '<', nextPeriodTimestamp)
    .get();
  const statsForDay = snapshot.docs.map((item) => item.data()).filter((item) => !!item) as Stats[];
  const current = combineCurrentStats(statsForDay);
  const stats = await combineWithPrevStats(current, startTimestamp, StatsPeriod.Daily, statsCollection);
  return stats;
}

export async function aggregateWeeklyStats(
  timestamp: number,
  statsCollection: FirebaseFirestore.CollectionReference
): Promise<BaseStats> {
  const period = getStatsDocInfo(timestamp, StatsPeriod.Weekly);
  const startTimestamp = period.timestamp;
  const oneWeek = 60 * 1000 * 60 * 24 * 7;
  const timestampInNextPeriod = period.timestamp + oneWeek;
  const nextPeriodTimestamp = getStatsDocInfo(timestampInNextPeriod, StatsPeriod.Weekly).timestamp;
  const snapshot = await statsCollection
    .where('period', '==', StatsPeriod.Daily)
    .where('timestamp', '>=', startTimestamp)
    .where('timestamp', '<', nextPeriodTimestamp)
    .get();
  const statsForWeek = snapshot.docs.map((item) => item.data()).filter((item) => !!item) as Stats[];
  const current = combineCurrentStats(statsForWeek);
  const stats = await combineWithPrevStats(current, startTimestamp, StatsPeriod.Weekly, statsCollection);
  return stats;
}

export async function aggregateMonthlyStats(
  timestamp: number,
  statsCollection: FirebaseFirestore.CollectionReference
): Promise<BaseStats> {
  const period = getStatsDocInfo(timestamp, StatsPeriod.Monthly);
  const startTimestamp = period.timestamp;
  const thirtyTwoDays = 60 * 1000 * 60 * 24 * 32;
  const timestampInNextPeriod = period.timestamp + thirtyTwoDays;
  const nextPeriodStartTimestamp = getStatsDocInfo(timestampInNextPeriod, StatsPeriod.Monthly).timestamp;
  const snapshot = await statsCollection
    .where('period', '==', StatsPeriod.Daily)
    .where('timestamp', '>=', startTimestamp)
    .where('timestamp', '<', nextPeriodStartTimestamp)
    .get();
  const statsForMonth = snapshot.docs.map((item) => item.data()).filter((item) => !!item) as Stats[];
  const current = combineCurrentStats(statsForMonth);
  const stats = await combineWithPrevStats(current, startTimestamp, StatsPeriod.Monthly, statsCollection);
  return stats;
}

export async function aggregateYearlyStats(
  timestamp: number,
  statsCollection: FirebaseFirestore.CollectionReference
): Promise<BaseStats> {
  const period = getStatsDocInfo(timestamp, StatsPeriod.Yearly);
  const startTimestamp = period.timestamp;
  const overOneYear = 60 * 1000 * 60 * 24 * 370;
  const timestampInNextPeriod = period.timestamp + overOneYear;
  const nextPeriodStartTimestamp = getStatsDocInfo(timestampInNextPeriod, StatsPeriod.Yearly).timestamp;
  const snapshot = await statsCollection
    .where('period', '==', StatsPeriod.Monthly)
    .where('timestamp', '>=', startTimestamp)
    .where('timestamp', '<', nextPeriodStartTimestamp)
    .get();
  const statsForYear = snapshot.docs.map((item) => item.data()).filter((item) => !!item) as Stats[];
  const current = combineCurrentStats(statsForYear);
  const stats = await combineWithPrevStats(current, startTimestamp, StatsPeriod.Yearly, statsCollection);
  return stats;
}

export async function aggregateAllTimeStats(
  statsCollection: FirebaseFirestore.CollectionReference
): Promise<BaseStats> {
  const snapshot = await statsCollection.where('period', '==', StatsPeriod.Yearly).where('timestamp', '>', 0).get();
  const statsForYear = snapshot.docs.map((item) => item.data()).filter((item) => !!item) as Stats[];
  const current = combineCurrentStats(statsForYear);
  return {
    ...current,
    ...({} as any)
  };
}

export async function aggregateSourceStats(
  update: SalesIntervalDoc,
  intervalRef: FirebaseFirestore.DocumentReference<SalesIntervalDoc>,
  statsCollectionRef: FirebaseFirestore.CollectionReference
) {
  const timestamp = Math.floor((update.startTimestamp + update.endTimestamp) / 2);

  const hourly = await aggregateHourlyStats(timestamp, intervalRef, statsCollectionRef);
  await saveStats(timestamp, StatsPeriod.Hourly, statsCollectionRef, hourly);
  const daily = await aggregateDailyStats(timestamp, statsCollectionRef);
  await saveStats(timestamp, StatsPeriod.Daily, statsCollectionRef, daily);
  const weekly = await aggregateWeeklyStats(timestamp, statsCollectionRef);
  await saveStats(timestamp, StatsPeriod.Weekly, statsCollectionRef, weekly);
  const monthly = await aggregateMonthlyStats(timestamp, statsCollectionRef);
  await saveStats(timestamp, StatsPeriod.Monthly, statsCollectionRef, monthly);
  const yearly = await aggregateYearlyStats(timestamp, statsCollectionRef);
  await saveStats(timestamp, StatsPeriod.Yearly, statsCollectionRef, yearly);
  const allTime = await aggregateAllTimeStats(statsCollectionRef);
  await saveStats(timestamp, StatsPeriod.All, statsCollectionRef, allTime);

  await intervalRef.update({
    updatedAt: Date.now(),
    isAggregated: true
  });
}

export async function aggregateCollectionStats(
  update: SalesIntervalDoc,
  intervalRef: FirebaseFirestore.DocumentReference<SalesIntervalDoc>,
  statsCollectionRef: FirebaseFirestore.CollectionReference
) {
  const collectionRef = statsCollectionRef.parent as FirebaseFirestore.DocumentReference<Partial<Collection>>;
  const [chainId, address] = collectionRef.id.split(':');
  const collectionSnap = await collectionRef.get();
  const collectionData = collectionSnap?.data() ?? {};
  const timestamp = Math.floor((update.startTimestamp + update.endTimestamp) / 2);
  const common = {
    name: collectionData?.metadata?.name ?? '',
    chainId: (collectionData?.chainId ?? chainId ?? ChainId.Mainnet) as ChainId,
    collectionAddress: collectionData?.address ?? address ?? '',
    profileImage: collectionData?.metadata?.profileImage ?? '',
    bannerImage: collectionData?.metadata?.bannerImage ?? '',
    slug: collectionData?.slug ?? '',
    hasBlueCheck: collectionData?.hasBlueCheck ?? false,
    numNfts: collectionData?.numNfts ?? null,
    numOwners: collectionData?.numOwners ?? null,
    volumeUSDC: 0, // TODO
    topOwnersByOwnedNftsCount: [] // TODO
  };

  const hourly = await aggregateHourlyStats(timestamp, intervalRef, statsCollectionRef);

  const collectionHourlyStats = {
    ...hourly,
    ...common
  };

  await saveCollectionStats(timestamp, StatsPeriod.Hourly, statsCollectionRef, collectionHourlyStats);
  const daily = await aggregateDailyStats(timestamp, statsCollectionRef);
  const collectionDailyStats = {
    ...daily,
    ...common
  };

  await saveCollectionStats(timestamp, StatsPeriod.Daily, statsCollectionRef, collectionDailyStats);
  const weekly = await aggregateWeeklyStats(timestamp, statsCollectionRef);
  const collectionWeeklyStats = {
    ...weekly,
    ...common
  };
  await saveCollectionStats(timestamp, StatsPeriod.Weekly, statsCollectionRef, collectionWeeklyStats);
  const monthly = await aggregateMonthlyStats(timestamp, statsCollectionRef);
  const collectionMonthlyStats = {
    ...monthly,
    ...common
  };

  await saveCollectionStats(timestamp, StatsPeriod.Monthly, statsCollectionRef, collectionMonthlyStats);
  const yearly = await aggregateYearlyStats(timestamp, statsCollectionRef);
  const collectionYearlyStats = {
    ...yearly,
    ...common
  };
  await saveCollectionStats(timestamp, StatsPeriod.Yearly, statsCollectionRef, collectionYearlyStats);
  const allTime = await aggregateAllTimeStats(statsCollectionRef);
  const collectionAllTimeStats = {
    ...allTime,
    ...common
  };
  await saveCollectionStats(timestamp, StatsPeriod.All, statsCollectionRef, collectionAllTimeStats);

  await intervalRef.update({
    updatedAt: Date.now(),
    isAggregated: true
  });
}

export async function aggregateNftStats(
  update: SalesIntervalDoc,
  intervalRef: FirebaseFirestore.DocumentReference<SalesIntervalDoc>,
  statsCollectionRef: FirebaseFirestore.CollectionReference
) {
  const nftRef = statsCollectionRef.parent as FirebaseFirestore.DocumentReference<Partial<Token>>;
  const tokenId = nftRef.id;
  const nftSnap = await nftRef.get();
  const collectionRef = nftRef.parent.parent as FirebaseFirestore.DocumentReference<Partial<Collection>>;
  const [chainId, address] = collectionRef.id.split(':');
  const collectionSnap = await collectionRef.get();
  const collectionData = collectionSnap?.data() ?? {};
  const nftData = nftSnap.data() ?? {};
  const timestamp = Math.floor((update.startTimestamp + update.endTimestamp) / 2);
  const common: CollectionLinkData & NftLinkData & { tokenId: string } = {
    tokenId: nftData.tokenId ?? tokenId ?? '',
    name: collectionData?.metadata?.name ?? '',
    chainId: (collectionData?.chainId ?? chainId ?? ChainId.Mainnet) as ChainId,
    collectionAddress: collectionData?.address ?? address ?? '',
    profileImage: collectionData?.metadata?.profileImage ?? '',
    bannerImage: collectionData?.metadata?.bannerImage ?? '',
    slug: collectionData?.slug ?? '',
    hasBlueCheck: collectionData?.hasBlueCheck ?? false,
    nftName: nftData?.metadata?.name ?? '',
    nftTitle: (nftData?.metadata as any)?.title ?? '',
    nftSlug: nftData?.slug ?? '',
    rarityRank: nftData?.rarityRank ?? null,
    rarityScore: nftData?.rarityScore ?? null,
    images: {
      image: (nftData?.image as NftImageDto | undefined) ?? null,
      zoraImage: nftData?.zoraImage ?? null,
      zoraContent: nftData?.zoraContent ?? null,
      alchemyCachedImage: nftData?.alchemyCachedImage ?? ''
    }
  };

  const hourly = await aggregateHourlyStats(timestamp, intervalRef, statsCollectionRef);
  const nftHourlyStats: Omit<NftStats, 'updatedAt' | 'timestamp' | 'period'> = {
    ...hourly,
    ...common
  };

  await saveNftStats(timestamp, StatsPeriod.Hourly, statsCollectionRef, nftHourlyStats);
  const daily = await aggregateDailyStats(timestamp, statsCollectionRef);
  const nftDailyStats: Omit<NftStats, 'updatedAt' | 'timestamp' | 'period'> = {
    ...daily,
    ...common
  };

  await saveNftStats(timestamp, StatsPeriod.Daily, statsCollectionRef, nftDailyStats);
  const weekly = await aggregateWeeklyStats(timestamp, statsCollectionRef);
  const nftWeeklyStats: Omit<NftStats, 'updatedAt' | 'timestamp' | 'period'> = {
    ...weekly,
    ...common
  };
  await saveNftStats(timestamp, StatsPeriod.Weekly, statsCollectionRef, nftWeeklyStats);
  const monthly = await aggregateMonthlyStats(timestamp, statsCollectionRef);
  const nftMonthlyStats: Omit<NftStats, 'updatedAt' | 'timestamp' | 'period'> = {
    ...monthly,
    ...common
  };

  await saveNftStats(timestamp, StatsPeriod.Monthly, statsCollectionRef, nftMonthlyStats);
  const yearly = await aggregateYearlyStats(timestamp, statsCollectionRef);
  const nftYearlyStats: Omit<NftStats, 'updatedAt' | 'timestamp' | 'period'> = {
    ...yearly,
    ...common
  };
  await saveNftStats(timestamp, StatsPeriod.Yearly, statsCollectionRef, nftYearlyStats);
  const allTime = await aggregateAllTimeStats(statsCollectionRef);
  const nftAllTimeStats: Omit<NftStats, 'updatedAt' | 'timestamp' | 'period'> = {
    ...allTime,
    ...common
  };
  await saveNftStats(timestamp, StatsPeriod.All, statsCollectionRef, nftAllTimeStats);

  await intervalRef.update({
    updatedAt: Date.now(),
    isAggregated: true
  });
}

export async function saveCollectionStats(
  ts: number,
  period: StatsPeriod,
  statsCollectionRef: FirebaseFirestore.CollectionReference,
  stats: Omit<CollectionSalesStats & CollectionLinkData, 'updatedAt' | 'timestamp' | 'period'>,
  batch?: FirebaseFirestore.WriteBatch
) {
  const socialsStatsSnap = (await statsCollectionRef.parent
    ?.collection(firestoreConstants.COLLECTION_SOCIALS_STATS_COLL)
    .where('period', '==', period)
    .where('timestamp', '<=', ts)
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get()) as FirebaseFirestore.QuerySnapshot<SocialsStats> | undefined;
  const socialsStats: Omit<SocialsStats, 'collectionAddress' | 'chainId' | 'period' | 'timestamp' | 'updatedAt'> =
    socialsStatsSnap?.docs?.[0]?.data() ?? {
      discordFollowers: null,
      discordPresence: null,
      guildId: null,
      discordLink: null,
      twitterFollowers: null,
      twitterFollowing: null,
      twitterId: null,
      twitterHandle: null,
      twitterLink: null,
      prevDiscordFollowers: null,
      discordFollowersPercentChange: null,
      prevDiscordPresence: null,
      discordPresencePercentChange: null,
      prevTwitterFollowers: null,
      twitterFollowersPercentChange: null,
      prevTwitterFollowing: null,
      twitterFollowingPercentChange: null
    };
  const statsWithSocials: Omit<CollectionStats, 'updatedAt' | 'timestamp' | 'period'> = {
    ...socialsStats,
    ...stats
  };
  return await saveStats(ts, period, statsCollectionRef, statsWithSocials, batch);
}

export async function saveNftStats(
  ts: number,
  period: StatsPeriod,
  statsCollectionRef: FirebaseFirestore.CollectionReference,
  stats: Omit<NftStats, 'updatedAt' | 'timestamp' | 'period'>,
  batch?: FirebaseFirestore.WriteBatch
) {
  return await saveStats(ts, period, statsCollectionRef, stats, batch);
}

export async function saveStats(
  ts: number,
  period: StatsPeriod,
  statsCollectionRef: FirebaseFirestore.CollectionReference,
  stats: BaseStats,
  batch?: FirebaseFirestore.WriteBatch
) {
  const { docId, timestamp } = getStatsDocInfo(ts, period);
  const statsWithMeta = {
    ...stats,
    period,
    timestamp,
    updatedAt: Date.now()
  };

  const docRef = statsCollectionRef.doc(docId);
  if (batch) {
    batch.set(docRef, statsWithMeta, { merge: true });
  } else {
    await docRef.set(statsWithMeta, { merge: true });
  }
}

export async function combineWithPrevStats(
  currentStats: CurrentStats,
  currentStatsStartTimestamp: number,
  period: StatsPeriod,
  statsCollection: FirebaseFirestore.CollectionReference
): Promise<BaseStats> {
  const { docId: prevHourlyStatsDocId } = getStatsDocInfo(currentStatsStartTimestamp - 1000, period);
  const mostRecentStatsSnapshot = await statsCollection
    .where('period', '==', period)
    .where('timestamp', '<', currentStatsStartTimestamp)
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();
  const mostRecentStatsDoc = mostRecentStatsSnapshot.docs[0];
  const mostRecentStats = mostRecentStatsDoc?.data();

  let prevStats: PrevBaseSalesStats & ChangeInSalesStats;
  if (!mostRecentStatsDoc || !mostRecentStats) {
    prevStats = {
      prevFloorPrice: null as any as number,
      prevCeilPrice: null as any as number,
      prevVolume: null as any as number,
      prevNumSales: null as any as number,
      prevAvgPrice: null as any as number,
      floorPricePercentChange: 0,
      ceilPricePercentChange: 0,
      volumePercentChange: 0,
      numSalesPercentChange: 0,
      avgPricePercentChange: 0
    };
  } else if (mostRecentStatsDoc.id === prevHourlyStatsDocId) {
    const prevFloorPrice = mostRecentStats.floorPrice || mostRecentStats.prevFloorPrice || null;
    const prevCeilPrice = mostRecentStats.ceilPrice || mostRecentStats.prevCeilPrice || null;
    const prevVolume = mostRecentStats.volume || mostRecentStats.prevVolume || 0;
    const prevAvgPrice = mostRecentStats.avgPrice || mostRecentStats.prevAvgPrice || null;
    const prevNumSales = mostRecentStats.numSales || mostRecentStats.prevNumSales || 0;

    prevStats = {
      prevFloorPrice: prevFloorPrice as number,
      prevCeilPrice: prevCeilPrice as number,
      prevVolume: prevVolume as number,
      prevNumSales: prevNumSales as number,
      prevAvgPrice: prevAvgPrice as number,
      floorPricePercentChange: calcPercentChange(prevFloorPrice, currentStats.floorPrice),
      ceilPricePercentChange: calcPercentChange(prevCeilPrice, currentStats.ceilPrice),
      volumePercentChange: calcPercentChange(prevVolume, currentStats.volume),
      numSalesPercentChange: calcPercentChange(prevNumSales, currentStats.numSales),
      avgPricePercentChange: calcPercentChange(prevAvgPrice, currentStats.avgPrice)
    };
  } else {
    /**
     * carryover floor price, ceil price and avg price
     */
    const prevFloorPrice = mostRecentStats.floorPrice || mostRecentStats.prevFloorPrice || null;
    const prevCeilPrice = mostRecentStats.ceilPrice || mostRecentStats.prevCeilPrice || null;
    const prevAvgPrice = mostRecentStats.avgPrice || mostRecentStats.prevAvgPrice || null;
    const prevVolume = 0;
    const prevNumSales = 0;

    prevStats = {
      prevFloorPrice: prevFloorPrice as number,
      prevCeilPrice: prevCeilPrice as number,
      prevVolume: prevVolume as number,
      prevNumSales: prevNumSales as number,
      prevAvgPrice: prevAvgPrice as number,
      floorPricePercentChange: calcPercentChange(prevFloorPrice, currentStats.floorPrice),
      ceilPricePercentChange: calcPercentChange(prevCeilPrice, currentStats.ceilPrice),
      volumePercentChange: calcPercentChange(prevVolume, currentStats.volume),
      numSalesPercentChange: calcPercentChange(prevNumSales, currentStats.numSales),
      avgPricePercentChange: calcPercentChange(prevAvgPrice, currentStats.avgPrice)
    };
  }

  return {
    ...currentStats,
    ...prevStats
  };
}
