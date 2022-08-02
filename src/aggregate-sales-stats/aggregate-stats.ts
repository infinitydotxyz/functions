import { NftSale, Stats, StatsPeriod } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { format, parse } from 'date-fns';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQueryWithRef } from '../firestore/stream-query';
import { AggregationInterval, BaseStats, ChangeInStats, CurrentStats, PrevStats, Sales } from './models/sales';
import { calcPercentChange, combineCurrentStats, getStatsDocInfo } from './utils';

export interface SalesIntervalDoc {
  updatedAt: number;
  hasUnaggregatedSales: boolean;
  isAggregated: boolean;
  startTimestamp: number;
  endTimestamp: number;
  stats: CurrentStats;
}

export const getIntervalAggregationId = (timestamp: number, interval: AggregationInterval) => {
  if (interval === AggregationInterval.FiveMinutes) {
    const date = format(timestamp, 'yyyy-MM-dd-HH');
    const min = format(timestamp, 'mm');
    const minInt = parseInt(min, 10);
    const intervalNum = `${Math.floor(minInt / 5)}`.padStart(2, '0');
    return `${date}-${intervalNum}`;
  }
  throw new Error(`Id not supported for interval: ${interval}`);
};

export const parseAggregationId = (id: string, interval: AggregationInterval) => {
  if (interval === AggregationInterval.FiveMinutes) {
    const [yyyy, MM, dd, HH, intervalNum] = id.split('-');
    const startMinute = parseInt(intervalNum, 10) * 5;
    const endMinute = startMinute + 5;
    const minMM = `${startMinute}`.padStart(2, '0');
    const maxMM = `${endMinute}`.padStart(2, '0');
    const minDateString = `${yyyy}-${MM}-${dd}-${HH}-${minMM}`;
    const maxDateString = `${yyyy}-${MM}-${dd}-${HH}-${maxMM}`;
    const minDate = parse(minDateString, 'yyyy-MM-dd-HH-mm', new Date());
    const maxDate = parse(maxDateString, 'yyyy-MM-dd-HH-mm', new Date());
    return { startTimestamp: minDate.getTime() + 1, endTimestamp: maxDate.getTime() };
  }

  throw new Error(`Parsing not supported for interval: ${interval}`);
};

export async function saveUnaggregatedSales(unaggregatedSales: (NftSale & { docId: string })[]) {
  const db = getDb();
  const batchHandler = new FirestoreBatchHandler();
  const sales = new Sales(unaggregatedSales);

  for (const [
    ,
    { salesByInterval: collectionSalesByInterval, collectionAddress, chainId }
  ] of sales.salesByCollectionByInterval) {
    for (const [interval, salesByIntervalId] of collectionSalesByInterval) {
      for (const [intervalId, { sales: intervalSales }] of salesByIntervalId) {
        const statsRef = db
          .collection('stats')
          .doc(`${chainId}:${collectionAddress}`)
          .collection(interval)
          .doc(intervalId);
        const salesRef = statsRef.collection('intervalSales');
        for (const sale of intervalSales) {
          const saleRef = salesRef.doc(sale.docId); // TODO need a listener to handle sales that get deleted => remove and set stats doc to aggregated: false
          batchHandler.add(saleRef, sale, { merge: false });
        }
        const statsDocUpdate: Partial<SalesIntervalDoc> = {
          updatedAt: Date.now(),
          isAggregated: false
        };
        batchHandler.add(statsRef, statsDocUpdate, { merge: true });
      }
    }
  }
  // TODO handle nft sales and source sales

  // for (const [, { salesByPeriod, collectionAddress, chainId }] of sales.salesByCollectionByPeriod) {
  //   for (const [period, salesByInterval] of salesByPeriod) {
  //     for (const [interval, { sales: intervalSales }] of salesByInterval) {
  //       const stats = sales.getStats(intervalSales);
  //       const ref = db.collection('stats').doc(`${chainId}:${collectionAddress}`).collection(period).doc(interval);
  //       batchHandler.add(ref, stats, { merge: false });
  //     }
  //   }
  // }

  // for (const [saleSource, sourceSales] of sales.salesBySource) {
  //   const sourceStats = sales.getStats(sourceSales);
  //   const ref = db.collection('contractStats').doc(saleSource);
  //   batchHandler.add(ref, sourceStats, { merge: false });
  // }

  await batchHandler.flush();
}

export async function saveSalesForAggregation() {
  const db = getDb();
  const unaggregatedSales = db
    .collection(firestoreConstants.SALES_COLL)
    .where('isAggregated', '==', false) as FirebaseFirestore.Query<NftSale | undefined>;
  const unaggregatedSalesStream = streamQueryWithRef(unaggregatedSales, (item, ref) => [ref], {
    pageSize: 300
  });

  const salesArray: {
    sale: NftSale & { docId: string };
    ref: FirebaseFirestore.DocumentReference<NftSale | undefined>;
  }[] = [];
  for await (const { data, ref } of unaggregatedSalesStream) {
    if (data) {
      salesArray.push({ sale: { ...data, docId: ref.id }, ref });
    }
  }

  for (const { ref } of salesArray) {
    try {
      await db.runTransaction(async (tx) => {
        const saleSnap = await tx.get(ref);
        const sale = saleSnap.data();
        if (!sale) {
          return;
        }
        const saleWithDocId = {
          ...sale,
          docId: ref.id
        };
        saveSaleToCollectionSales(saleWithDocId, tx);
        saveSaleToNftSales(saleWithDocId, tx);
        saveSaleToSourceSales(saleWithDocId, tx);
        const saleUpdate: Pick<NftSale, 'isAggregated'> = {
          isAggregated: true
        };
        tx.update(ref, saleUpdate);
      });
    } catch (err) {
      console.error(err);
    }
  }
}

export function saveSaleToCollectionSales(sale: NftSale & { docId: string }, tx: FirebaseFirestore.Transaction) {
  const db = getDb();
  const intervalId = getIntervalAggregationId(sale.timestamp, AggregationInterval.FiveMinutes);
  const collectionStatsRef = db
    .collection(firestoreConstants.COLLECTIONS_COLL)
    .doc(`${sale.chainId}:${sale.collectionAddress}`)
    .collection('aggregatedCollectionSales')
    .doc(intervalId);
  const salesRef = collectionStatsRef.collection('intervalSales');
  const saleRef = salesRef.doc(sale.docId); // TODO need a listener to handle sales that get deleted => remove and set stats doc to aggregated: false
  if (sale.isDeleted) {
    tx.delete(saleRef);
  } else {
    tx.set(saleRef, sale, { merge: false });
  }
  const statsDocUpdate: Partial<SalesIntervalDoc> = {
    updatedAt: Date.now(),
    hasUnaggregatedSales: true
  };
  tx.set(collectionStatsRef, statsDocUpdate, { merge: true });
}

export function saveSaleToNftSales(sale: NftSale & { docId: string }, tx: FirebaseFirestore.Transaction) {
  const db = getDb();
  const intervalId = getIntervalAggregationId(sale.timestamp, AggregationInterval.FiveMinutes);
  const nftStatsRef = db
    .collection(firestoreConstants.COLLECTIONS_COLL)
    .doc(`${sale.chainId}:${sale.collectionAddress}`)
    .collection(firestoreConstants.COLLECTION_NFTS_COLL)
    .doc(sale.tokenId)
    .collection('aggregatedNftSales')
    .doc(intervalId);
  const salesRef = nftStatsRef.collection('intervalSales');
  const saleRef = salesRef.doc(sale.docId); // TODO need a listener to handle sales that get deleted => remove and set stats doc to aggregated: false
  if (sale.isDeleted) {
    tx.delete(saleRef);
  } else {
    tx.set(saleRef, sale, { merge: false });
  }
  const statsDocUpdate: Partial<SalesIntervalDoc> = {
    updatedAt: Date.now(),
    hasUnaggregatedSales: true
  };
  tx.set(nftStatsRef, statsDocUpdate, { merge: true });
}

export function saveSaleToSourceSales(sale: NftSale & { docId: string }, tx: FirebaseFirestore.Transaction) {
  const db = getDb();
  const intervalId = getIntervalAggregationId(sale.timestamp, AggregationInterval.FiveMinutes);
  const sourceStatsRef = db
    .collection('marketplaceStats')
    .doc(`${sale.source}`)
    .collection('aggregatedSourceSales')
    .doc(intervalId);
  const salesRef = sourceStatsRef.collection('intervalSales');
  const saleRef = salesRef.doc(sale.docId); // TODO need a listener to handle sales that get deleted => remove and set stats doc to aggregated: false
  if (sale.isDeleted) {
    tx.delete(saleRef);
  } else {
    tx.set(saleRef, sale, { merge: false });
  }
  const statsDocUpdate: Partial<SalesIntervalDoc> = {
    updatedAt: Date.now(),
    hasUnaggregatedSales: true
  };
  tx.set(sourceStatsRef, statsDocUpdate, { merge: true });
}

export async function aggregateIntervalSales(ref: FirebaseFirestore.DocumentReference<SalesIntervalDoc>) {
  try {
    await ref.firestore.runTransaction(async (tx) => {
      const initialDoc = await tx.get(ref);
      if (!initialDoc.data()?.isAggregated) {
        const salesSnapshot = await tx.get(ref.collection('intervalSales').where('isDeleted', '==', false));
        const salesDocs = salesSnapshot.docs.map((item) => item.data());
        const sales = salesDocs.filter((sale) => !sale) as NftSale[];
        const stats = Sales.getStats(sales);
        const { startTimestamp, endTimestamp } = parseAggregationId(ref.id, AggregationInterval.FiveMinutes);
        const updatedIntervalDoc: SalesIntervalDoc = {
          updatedAt: Date.now(),
          isAggregated: true,
          startTimestamp,
          endTimestamp,
          stats,
          hasUnaggregatedSales: false
        };
        tx.update(ref, updatedIntervalDoc);
      }
    });
  } catch (err) {
    console.error('Failed to aggregate sales', err);
  }
}

export async function aggregateHourlyStats(timestamp: number, intervalRef: FirebaseFirestore.DocumentReference<SalesIntervalDoc>, statsCollection: FirebaseFirestore.CollectionReference): Promise<BaseStats> {
  const period = getStatsDocInfo(timestamp, StatsPeriod.Hourly);
  const startTimestamp = period.timestamp;
  const oneHour = (60 * 1000 * 60);
  const endTimestamp = period.timestamp + oneHour;
  const salesIntervalsColl = intervalRef.parent;
  const snapshot = await salesIntervalsColl.where('startTimestamp', '>' , startTimestamp).where('endTimestamp', '<=', endTimestamp).get()
  const statsForHour = snapshot.docs.map((item) => item.data()).filter((item) => !!item.stats).map((item) => item.stats);
  const current = combineCurrentStats(statsForHour);
  const stats = await combineWithPrevStats(current, startTimestamp, StatsPeriod.Hourly, statsCollection);
  return stats;
}

export async function aggregateDailyStats(timestamp: number, statsCollection: FirebaseFirestore.CollectionReference): Promise<BaseStats> {
  const period = getStatsDocInfo(timestamp, StatsPeriod.Daily);
  const startTimestamp = period.timestamp;
  const oneDay = (60 * 1000 * 60 * 24);
  const endTimestamp = period.timestamp + oneDay;
  const snapshot = await statsCollection.where('period', '==', StatsPeriod.Hourly).where('timestamp', '>', startTimestamp).where('endTimestamp', '<=', endTimestamp).get();
  const statsForDay = snapshot.docs.map((item) => item.data()).filter((item) => !!item) as Stats[];
  const current = combineCurrentStats(statsForDay);
  const stats = await combineWithPrevStats(current, startTimestamp, StatsPeriod.Daily, statsCollection);
  return stats;
}

export async function aggregateWeeklyStats(timestamp: number, statsCollection: FirebaseFirestore.CollectionReference): Promise<BaseStats> {
  const period = getStatsDocInfo(timestamp, StatsPeriod.Weekly);
  const startTimestamp = period.timestamp;
  const oneWeek = (60 * 1000 * 60 * 24 * 7);
  const endTimestamp = period.timestamp + oneWeek;
  const snapshot = await statsCollection.where('period', '==', StatsPeriod.Daily).where('timestamp', '>', startTimestamp).where('endTimestamp', '<=', endTimestamp).get();
  const statsForWeek = snapshot.docs.map((item) => item.data()).filter((item) => !!item) as Stats[];
  const current = combineCurrentStats(statsForWeek);
  const stats = await combineWithPrevStats(current, startTimestamp, StatsPeriod.Weekly, statsCollection);
  return stats;
}

export async function aggregateMonthlyStats(timestamp: number, statsCollection: FirebaseFirestore.CollectionReference): Promise<BaseStats> {
  const period = getStatsDocInfo(timestamp, StatsPeriod.Monthly);
  const startTimestamp = period.timestamp;
  const thirtyTwoDays = (60 * 1000 * 60 * 24 * 32);
  const timestampInNextMonth = period.timestamp + thirtyTwoDays;
  const nextPeriodStartTimestamp = getStatsDocInfo(timestampInNextMonth, StatsPeriod.Monthly).timestamp;
  const endTimestamp = nextPeriodStartTimestamp - 1000;
  const snapshot = await statsCollection.where('period', '==', StatsPeriod.Daily).where('timestamp', '>', startTimestamp).where('endTimestamp', '<=', endTimestamp).get();
  const statsForMonth = snapshot.docs.map((item) => item.data()).filter((item) => !!item) as Stats[];
  const current = combineCurrentStats(statsForMonth);
  const stats = await combineWithPrevStats(current, startTimestamp, StatsPeriod.Monthly, statsCollection);
  return stats;
}

export async function aggregateYearlyStats(timestamp: number, statsCollection: FirebaseFirestore.CollectionReference): Promise<BaseStats> {
  const period = getStatsDocInfo(timestamp, StatsPeriod.Yearly);
  const startTimestamp = period.timestamp;
  const overOneYear = (60 * 1000 * 60 * 24 * 370);
  const timestampInNextYear = period.timestamp + overOneYear;
  const nextPeriodStartTimestamp = getStatsDocInfo(timestampInNextYear, StatsPeriod.Yearly).timestamp;
  const endTimestamp = nextPeriodStartTimestamp - 1000;
  const snapshot = await statsCollection.where('period', '==', StatsPeriod.Monthly).where('timestamp', '>', startTimestamp).where('endTimestamp', '<=', endTimestamp).get();
  const statsForYear = snapshot.docs.map((item) => item.data()).filter((item) => !!item) as Stats[];
  const current = combineCurrentStats(statsForYear);
  const stats = await combineWithPrevStats(current, startTimestamp, StatsPeriod.Yearly, statsCollection);
  return stats;
}

export async function aggregateAllTimeStats(statsCollection: FirebaseFirestore.CollectionReference): Promise<BaseStats> {
  const snapshot = await statsCollection.where('period', '==', StatsPeriod.Yearly).where('timestamp', '>', 0).get();
  const statsForYear = snapshot.docs.map((item) => item.data()).filter((item) => !!item) as Stats[];
  const current = combineCurrentStats(statsForYear);
  return {
    ...current,
    ...{} as any
  };
}


export async function aggregateStats(update: SalesIntervalDoc, intervalRef: FirebaseFirestore.DocumentReference<SalesIntervalDoc>, statsCollectionRef: FirebaseFirestore.CollectionReference) {
  const timestamp = Math.floor((update.startTimestamp + update.endTimestamp) / 2);
  await aggregateHourlyStats(timestamp, intervalRef, statsCollectionRef); 
  await aggregateDailyStats(timestamp, statsCollectionRef); 
  await aggregateWeeklyStats(timestamp, statsCollectionRef); 
  await aggregateMonthlyStats(timestamp, statsCollectionRef); 
  await aggregateYearlyStats(timestamp, statsCollectionRef); 
  await aggregateAllTimeStats(statsCollectionRef); 
}

export async function combineWithPrevStats(currentStats: CurrentStats, currentStatsStartTimestamp: number ,period: StatsPeriod, statsCollection: FirebaseFirestore.CollectionReference): Promise<BaseStats> {
  const {docId: prevHourlyStatsDocId } = getStatsDocInfo(currentStatsStartTimestamp - 1000, period);
  const mostRecentStatsSnapshot = await statsCollection.where('period', '==', period).where('timestamp', '<', currentStatsStartTimestamp).orderBy('timestamp','desc').limit(1).get();
  const mostRecentStatsDoc = mostRecentStatsSnapshot.docs[0];
  const mostRecentStats = mostRecentStatsDoc?.data();

  let prevStats: PrevStats & ChangeInStats;
  if(!mostRecentStatsDoc || !mostRecentStats) {
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
    }
  } else if(mostRecentStatsDoc.id === prevHourlyStatsDocId) {
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
    }
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
    }
  }

  return {
    ...currentStats,
    ...prevStats
  }
}