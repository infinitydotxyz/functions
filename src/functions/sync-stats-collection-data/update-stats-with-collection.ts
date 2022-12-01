import { Collection, StatsPeriod } from '@infinityxyz/lib/types/core';

import { getStatsDocInfo } from '../aggregate-sales-stats/utils';

export async function updateStatsWithCollection(
  collectionData: Partial<Collection>,
  statsCollectionRef: FirebaseFirestore.CollectionReference
) {
  const now = Date.now();
  const { docId: allTimeDocId } = getStatsDocInfo(now, StatsPeriod.All);
  const { docId: currYearDocId } = getStatsDocInfo(now, StatsPeriod.Yearly);
  const { docId: currMonthDocId } = getStatsDocInfo(now, StatsPeriod.Monthly);
  const { docId: currWeekDocId } = getStatsDocInfo(now, StatsPeriod.Weekly);
  const { docId: currDayDocId } = getStatsDocInfo(now, StatsPeriod.Daily);
  const { docId: currHourDocId } = getStatsDocInfo(now, StatsPeriod.Hourly);

  const docIds = [allTimeDocId, currYearDocId, currMonthDocId, currWeekDocId, currDayDocId, currHourDocId];
  const docRefs = docIds.map((docId) => statsCollectionRef.doc(docId));
  const docs = docRefs.length > 0 ? await statsCollectionRef.firestore.getAll(...docRefs) : [];
  const existingDocs = docs.filter((item) => item.exists);
  const batch = statsCollectionRef.firestore.batch();

  for (const doc of existingDocs) {
    batch.set(
      doc.ref,
      {
        name: collectionData.metadata?.name ?? '',
        slug: collectionData.slug ?? '',
        hasBlueCheck: collectionData.hasBlueCheck ?? false,
        profileImage: collectionData.metadata?.profileImage ?? '',
        bannerImage: collectionData.metadata?.bannerImage ?? '',
        numNfts: collectionData.numNfts ?? null,
        numOwners: collectionData.numOwners ?? null
      },
      { merge: true }
    );
  }
  await batch.commit();
}
