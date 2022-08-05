import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQueryWithRef } from '../firestore/stream-query';
import { CurationPeriodAggregator } from './curation-period-aggregator';
import { CurationBlockRewardsDoc, CurationMetadata, CurationPeriodDoc, CurationPeriodUser } from './types';

export async function aggregatePeriods(
  curationMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>,
  collectionAddress: string,
  chainId: ChainId
) {
  const curationBlockRewardsRef = curationMetadataRef.collection(
    'curationBlockRewards'
  ) as FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc>;
  const snapshot = await curationBlockRewardsRef
    .where('isAggregate', '==', false)
    .orderBy('timestamp', 'asc')
    .limit(1)
    .get();
  const firstUnaggregatedDoc = snapshot.docs[0];
  const firstUnaggregatedBlock = firstUnaggregatedDoc?.data() as CurationBlockRewardsDoc | undefined;

  if (!firstUnaggregatedBlock) {
    console.error(`Failed to find unaggregated block for ${curationMetadataRef.path}`);
    return;
  }

  let curationPeriodRange = CurationPeriodAggregator.getCurationPeriodRange(firstUnaggregatedBlock.timestamp);
  while (curationPeriodRange.startTimestamp < Date.now()) {
    const aggregationStartTime = Date.now();
    const periodBlockWithRefs = await CurationPeriodAggregator.getCurationPeriodBlocks(
      curationPeriodRange.startTimestamp,
      curationBlockRewardsRef
    );
    const periodBlocks = periodBlockWithRefs.map((item) => item.block);
    const aggregator = new CurationPeriodAggregator(curationPeriodRange.startTimestamp, collectionAddress, chainId);
    const rewards = aggregator.getPeriodRewards(periodBlocks);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { users, blocks, ...curationPeriodDocData } = rewards;
    const batchHandler = new FirestoreBatchHandler();
    const curationPeriodDocId = `${curationPeriodRange.startTimestamp}`;
    const curationPeriodDocRef = curationMetadataRef
      .collection('curationPeriods')
      .doc(curationPeriodDocId) as FirebaseFirestore.DocumentReference<CurationPeriodDoc>;
    const curationPeriodUpdate: CurationPeriodDoc = {
      ...curationPeriodDocData
    };
    batchHandler.add(curationPeriodDocRef, curationPeriodUpdate, { merge: false });
    for (const user of Object.values(users)) {
      const userDoc = curationPeriodDocRef
        .collection('curationPeriodUserRewards')
        .doc(user.userAddress) as FirebaseFirestore.DocumentReference<CurationPeriodUser>;
      batchHandler.add(userDoc, user, { merge: false });
    }

    await batchHandler.flush();

    const invalidUsersQuery = curationPeriodDocRef
      .collection('curationPeriodUserRewards')
      .where('updatedAt', '<', aggregationStartTime);
    const invalidUsersStream = streamQueryWithRef(invalidUsersQuery, (item, ref) => [ref], { pageSize: 300 });
    const batch = curationPeriodDocRef.firestore.batch();
    for await (const invalidUser of invalidUsersStream) {
      batch.delete(invalidUser.ref);
    }
    await batch.commit();

    curationPeriodRange = CurationPeriodAggregator.getCurationPeriodRange(curationPeriodRange.endTimestamp);
  }
}
