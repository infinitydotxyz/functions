/* eslint-disable @typescript-eslint/no-unused-vars */
import { ChainId, CollectionDisplayData, Erc20TokenMetadata } from '@infinityxyz/lib/types/core';
import {
  CurationBlockRewards,
  CurationBlockRewardsDoc,
  CurationBlockUser,
  CurationBlockUsers,
  CurationPeriod,
  CurationPeriodDoc,
  CurrentCurationSnippetDoc
} from '@infinityxyz/lib/types/core/curation-ledger';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { CurationBlock } from './curation-block';
import { CurationBlockAggregator } from './curation-block-aggregator';
import { CurationPeriodAggregator } from './curation-period-aggregator';
import { CurationMetadata } from './types';

export async function getCurrentBlocks(
  curationMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>
): Promise<{ current: CurationBlockRewards | null; mostRecent: CurationBlockRewards | null }> {
  const blockRewards = curationMetadataRef.collection(
    firestoreConstants.CURATION_BLOCK_REWARDS_COLL
  ) as FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc>;
  const mostRecentBlocksQuery = blockRewards
    .where('metadata.isAggregated', '==', true)
    .orderBy('metadata.timestamp', 'desc')
    .limit(2);
  const mostRecentBlocksSnapshot = await mostRecentBlocksQuery.get();

  const currentBlockTimestampRange = CurationBlockAggregator.getCurationBlockRange(Date.now());
  const blocks = (
    await Promise.all(
      mostRecentBlocksSnapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const isCurrent = docData.metadata.timestamp === currentBlockTimestampRange.startTimestamp;
        const isPrev = docData.metadata.timestamp === currentBlockTimestampRange.prevTimestamp;
        const blockUsers = await CurationBlock.getBlockUsers(doc.ref);

        return {
          ...docData,
          users: blockUsers,
          isCurrent,
          isPrev
        };
      })
    )
  ).reduce(
    (acc: { current: CurationBlockRewards | null; mostRecent: CurationBlockRewards | null }, curr) => {
      if (curr.isCurrent) {
        const { isPrev, isCurrent, ...rest } = curr;
        acc.current = rest;
      } else if (acc.mostRecent == null || acc.mostRecent.metadata.timestamp < curr.metadata.timestamp) {
        const { isPrev, isCurrent, ...rest } = curr;
        acc.mostRecent = rest;
      }
      return acc;
    },
    { current: null, mostRecent: null }
  );

  return blocks;
}

export async function getCurrentPeriods(
  curationMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>
): Promise<{ current: CurationPeriod | null; mostRecent: CurationPeriod | null }> {
  const periodRewards = curationMetadataRef.collection(
    firestoreConstants.CURATION_PERIOD_REWARDS_COLL
  ) as FirebaseFirestore.CollectionReference<CurationPeriodDoc>;

  const mostRecentPeriodQuery = periodRewards.orderBy('metadata.timestamp', 'desc').limit(2);

  const mostRecentPeriodsSnapshot = await mostRecentPeriodQuery.get();

  const currentPeriodTimestampRange = CurationPeriodAggregator.getCurationPeriodRange(Date.now());
  const periods = (
    await Promise.all(
      mostRecentPeriodsSnapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const isCurrent = docData.metadata.timestamp === currentPeriodTimestampRange.startTimestamp;
        const isPrev = docData.metadata.timestamp === currentPeriodTimestampRange.prevTimestamp;
        const periodUsers = await CurationPeriodAggregator.getCurationPeriodUsers(doc.ref);
        return {
          ...docData,
          users: periodUsers,
          isCurrent,
          isPrev
        };
      })
    )
  ).reduce(
    (acc: { current: CurationPeriod | null; mostRecent: CurationPeriod | null }, curr) => {
      if (curr.isCurrent) {
        const { isPrev, isCurrent, ...rest } = curr;
        acc.current = rest;
      } else if (acc.mostRecent == null || acc.mostRecent.metadata.timestamp < curr.metadata.timestamp) {
        acc.mostRecent = curr;
      }
      return acc;
    },
    { current: null, mostRecent: null }
  );

  return periods;
}

export function getCurrentCurationSnippet(
  periods: { current: CurationPeriod | null; mostRecent: CurationPeriod | null },
  blocks: { current: CurationBlockRewards | null; mostRecent: CurationBlockRewards | null },
  stakerContractAddress: string,
  stakerContractChainId: ChainId,
  token: Erc20TokenMetadata,
  collectionAddress: string,
  collectionChainId: ChainId,
  collection: CollectionDisplayData
): { curationSnippet: CurrentCurationSnippetDoc; users: CurationBlockUsers } {
  const { users: currentPeriodUsers, ...currentPeriodDoc } = periods.current ?? {};
  const { users: mostRecentPeriodUsers, ...mostRecentPeriodDoc } = periods.mostRecent ?? {};
  const { users: currentBlockUsers, ...currentBlockDoc } = blocks.current ?? {};
  const { users: mostRecentBlockUsers, ...mostRecentBlockDoc } = blocks.mostRecent ?? {};

  const currentCurationSnippet: CurrentCurationSnippetDoc = {
    currentPeriod:
      'metadata' in currentPeriodDoc ? { metadata: currentPeriodDoc.metadata, stats: currentPeriodDoc.stats } : null,
    currentBlock:
      'metadata' in currentBlockDoc ? { metadata: currentBlockDoc.metadata, stats: currentBlockDoc.stats } : null,
    mostRecentCompletedBlock:
      'metadata' in mostRecentBlockDoc
        ? { metadata: mostRecentBlockDoc.metadata, stats: mostRecentBlockDoc.stats }
        : null,
    mostRecentCompletedPeriod:
      'metadata' in mostRecentPeriodDoc
        ? { metadata: mostRecentPeriodDoc.metadata, stats: mostRecentPeriodDoc.stats }
        : null,
    metadata: {
      updatedAt: Date.now(),
      collectionAddress,
      collectionChainId,
      stakerContractAddress,
      stakerContractChainId,
      tokenContractAddress: token.address,
      tokenContractChainId: token.chainId
    },
    collection
  };

  return {
    curationSnippet: currentCurationSnippet,
    users: currentBlockUsers ?? mostRecentBlockUsers ?? {}
  };
}

export async function saveCurrentCurationSnippet(
  { curationSnippet, users }: { curationSnippet: CurrentCurationSnippetDoc; users: CurationBlockUsers },
  curationMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>
) {
  const curationSnippetRef = curationMetadataRef
    .collection('curationSnippets')
    .doc(firestoreConstants.CURATION_SNIPPET_DOC);
  await curationSnippetRef.set(curationSnippet, { merge: true });

  const curationSnippetUsersRef = curationSnippetRef.collection(firestoreConstants.CURATION_SNIPPET_USERS_COLL);
  const usersUpdatedAt = Date.now();
  const batchHandler = new FirestoreBatchHandler();
  for (const [address, user] of Object.entries(users)) {
    if (address) {
      user.metadata.updatedAt = usersUpdatedAt;
      const ref = curationSnippetUsersRef.doc(address);
      batchHandler.add(ref, user, { merge: false });
    }
  }
  await batchHandler.flush();

  const expiredUsers = curationSnippetUsersRef.where('metadata.updatedAt', '<', usersUpdatedAt);
  const usersToDelete = streamQueryWithRef(expiredUsers, (item, ref) => [ref], { pageSize: 300 });
  for await (const { data, ref } of usersToDelete) {
    batchHandler.delete(ref);
  }

  await batchHandler.flush();
}
