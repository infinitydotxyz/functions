/* eslint-disable @typescript-eslint/no-unused-vars */
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQueryWithRef } from '../firestore/stream-query';
import { CurationBlock } from './curation-block';
import { CurationBlockAggregator } from './curation-block-aggregator';
import { CurationPeriodAggregator } from './curation-period-aggregator';
import {
  CurationBlockRewards,
  CurationBlockRewardsDoc,
  CurationMetadata,
  CurationPeriod,
  CurationPeriodDoc,
  CurationUser,
  CurationUsers,
  CurrentCurationSnippetDoc
} from './types';

export async function getCurrentBlocks(
  curationMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>
): Promise<{ current: CurationBlockRewards | null; mostRecent: CurationBlockRewards | null }> {
  const blockRewards = curationMetadataRef.collection(
    'curationBlockRewards'
  ) as FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc>;
  const mostRecentBlocksQuery = blockRewards.where('isAggregated', '==', true).orderBy('timestamp', 'desc').limit(2);
  const mostRecentBlocksSnapshot = await mostRecentBlocksQuery.get();

  const currentBlockTimestampRange = CurationBlockAggregator.getCurationBlockRange(Date.now());
  const blocks = (
    await Promise.all(
      mostRecentBlocksSnapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const isCurrent = docData.timestamp === currentBlockTimestampRange.startTimestamp;
        const isPrev = docData.timestamp === currentBlockTimestampRange.prevTimestamp;
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
      } else if (acc.mostRecent == null || acc.mostRecent.timestamp < curr.timestamp) {
        acc.mostRecent = curr;
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
    'curationPeriodRewards'
  ) as FirebaseFirestore.CollectionReference<CurationPeriodDoc>;

  const mostRecentPeriodQuery = periodRewards.orderBy('timestamp', 'desc').limit(2);

  const mostRecentPeriodsSnapshot = await mostRecentPeriodQuery.get();

  const currentPeriodTimestampRange = CurationPeriodAggregator.getCurationPeriodRange(Date.now());
  const periods = (
    await Promise.all(
      mostRecentPeriodsSnapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const isCurrent = docData.timestamp === currentPeriodTimestampRange.startTimestamp;
        const isPrev = docData.timestamp === currentPeriodTimestampRange.prevTimestamp;
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
      } else if (acc.mostRecent == null || acc.mostRecent.timestamp < curr.timestamp) {
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
  blocks: { current: CurationBlockRewards | null; mostRecent: CurationBlockRewards | null }
): { curationSnippet: CurrentCurationSnippetDoc; users: CurationUsers } {
  const sortUsersByTotalProtocolFees = (users: CurationUsers): CurationUser[] => {
    return Object.values(users).sort((a, b) => {
      return b.totalProtocolFeesAccruedEth - a.totalProtocolFeesAccruedEth;
    });
  };

  const sortUsersByVotes = (users: CurationUsers): CurationUser[] => {
    return Object.values(users).sort((a, b) => {
      return b.totalProtocolFeesAccruedEth - a.totalProtocolFeesAccruedEth;
    });
  };
  const sortUsersByFirstVotedAt = (users: CurationUsers): CurationUser[] => {
    return Object.values(users).sort((a, b) => {
      return a.firstVotedAt - b.firstVotedAt;
    });
  };
  const { users: currentPeriodUsers, ...currentPeriodDoc } = periods.current ?? {};
  const { users: mostRecentPeriodUsers, ...mostRecentPeriodDoc } = periods.mostRecent ?? {};
  const { users: currentBlockUsers, ...currentBlockDoc } = blocks.current ?? {};
  const { users: mostRecentBlockUsers, ...mostRecentBlockDoc } = blocks.mostRecent ?? {};

  const topUsersByVotes = sortUsersByVotes(currentBlockUsers ?? mostRecentBlockUsers ?? {});
  const topUsersByTotalProtocolFees = sortUsersByTotalProtocolFees(currentBlockUsers ?? mostRecentBlockUsers ?? {});
  const earliestUsers = sortUsersByFirstVotedAt(currentBlockUsers ?? mostRecentBlockUsers ?? {});

  const numTopUsers = 10;
  const currentCurationSnippet: CurrentCurationSnippetDoc = {
    currentPeriod: 'timestamp' in currentPeriodDoc ? currentPeriodDoc : null,
    currentBlock: 'timestamp' in currentBlockDoc ? currentBlockDoc : null,
    mostRecentCompletedBlock: 'timestamp' in mostRecentBlockDoc ? mostRecentBlockDoc : null,
    mostRecentCompletedPeriod: 'timestamp' in mostRecentPeriodDoc ? mostRecentPeriodDoc : null,
    updatedAt: Date.now(),
    topCuratorsByVotes: topUsersByVotes.slice(0, numTopUsers),
    topCuratorsByTotalProtocolFees: topUsersByTotalProtocolFees.slice(0, numTopUsers),
    earliestCurators: earliestUsers.slice(0, numTopUsers)
  };

  return {
    curationSnippet: currentCurationSnippet,
    users: mostRecentBlockUsers ?? {}
  };
}

export async function saveCurrentCurationSnippet(
  { curationSnippet, users }: { curationSnippet: CurrentCurationSnippetDoc; users: CurationUsers },
  curationMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>
) {
  const curationSnippetRef = curationMetadataRef.parent.doc('curationSnippet');
  const curationSnippetUsersRef = curationMetadataRef.parent.doc('curationSnippet').collection('curationSnippetUsers');
  await curationSnippetRef.set(curationSnippet, { merge: true });

  const usersUpdatedAt = Date.now();
  const batchHandler = new FirestoreBatchHandler();
  for (const [address, user] of Object.entries(users)) {
    if (address) {
      user.updatedAt = usersUpdatedAt;
      const ref = curationSnippetUsersRef.doc(address);
      batchHandler.add(ref, user, { merge: false });
    }
  }

  await batchHandler.flush();

  const expiredUsers = curationSnippetUsersRef.where('updatedAt', '<', usersUpdatedAt);
  const usersToDelete = streamQueryWithRef(expiredUsers, (item, ref) => [ref], { pageSize: 300 });
  for await (const { data, ref } of usersToDelete) {
    batchHandler.delete(ref);
  }

  await batchHandler.flush();
}
