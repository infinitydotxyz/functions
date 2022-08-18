/* eslint-disable @typescript-eslint/no-unused-vars */
import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import {
  CurationBlockRewardsDoc,
  CurationPeriodDoc,
  CurationPeriodUser
} from '@infinityxyz/lib/types/core/curation-ledger';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { CurationPeriodAggregator } from './curation-period-aggregator';
import { CurationMetadata } from './types';

export async function aggregateBlocks(
  stakerContractCurationMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>,
  collectionAddress: string,
  collectionChainId: ChainId,
  stakerContractAddress: string,
  stakerContractChainId: ChainId,
  tokenContractAddress: string,
  tokenContractChainId: ChainId
) {
  const curationBlockRewardsRef = stakerContractCurationMetadataRef.collection(
    firestoreConstants.CURATION_BLOCK_REWARDS_COLL
  ) as FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc>;
  const snapshot = await curationBlockRewardsRef
    .where('isAggregated', '==', false)
    .orderBy('timestamp', 'asc')
    .limit(1)
    .get();
  const firstUnaggregatedDoc = snapshot.docs[0];
  const firstUnaggregatedBlock = firstUnaggregatedDoc?.data() as CurationBlockRewardsDoc | undefined;

  if (!firstUnaggregatedBlock) {
    console.error(`Failed to find unaggregated block for ${stakerContractCurationMetadataRef.path}`);
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
    const aggregator = new CurationPeriodAggregator(
      curationPeriodRange.startTimestamp,
      collectionAddress,
      collectionChainId,
      stakerContractAddress,
      stakerContractChainId,
      tokenContractAddress,
      tokenContractChainId
    );
    const rewards = aggregator.getPeriodRewards(periodBlocks);
    const { users, ...curationPeriodDocData } = rewards;
    const batchHandler = new FirestoreBatchHandler();
    const curationPeriodDocId = `${curationPeriodRange.startTimestamp}`;
    const curationPeriodDocRef = stakerContractCurationMetadataRef
      .collection(firestoreConstants.CURATION_PERIOD_REWARDS_COLL)
      .doc(curationPeriodDocId) as FirebaseFirestore.DocumentReference<CurationPeriodDoc>;
    const curationPeriodUpdate: CurationPeriodDoc = {
      ...curationPeriodDocData
    };
    batchHandler.add(curationPeriodDocRef, curationPeriodUpdate, { merge: false });
    for (const user of Object.values(users)) {
      const userDoc = curationPeriodDocRef
        .collection(firestoreConstants.CURATION_PERIOD_USER_REWARDS_COLL)
        .doc(user.userAddress) as FirebaseFirestore.DocumentReference<CurationPeriodUser>;
      batchHandler.add(userDoc, user, { merge: false });
    }
    for (const { ref } of periodBlockWithRefs) {
      const blockUpdate: Partial<CurationBlockRewardsDoc> = {
        isAggregated: true
      };
      batchHandler.add(ref, blockUpdate, { merge: true });
    }

    await batchHandler.flush();

    const invalidUsersQuery = curationPeriodDocRef
      .collection(firestoreConstants.CURATION_PERIOD_USER_REWARDS_COLL)
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
