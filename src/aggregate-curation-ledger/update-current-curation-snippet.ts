import { streamQuery } from '../firestore/stream-query';
import { CurationBlock } from './curation-block';
import { CurationPeriodAggregator } from './curation-period-aggregator';
import {
  CurationBlockRewardsDoc,
  CurationMetadata,
  CurationPeriodDoc,
  CurationPeriodUser,
  CurationPeriodUsers,
  CurationUser,
  CurationUsers,
  CurrentCurationSnippetDoc
} from './types';

export async function updateCurrentCurationSnippet(
  curationMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>,
  collectionAddress: string,
  chainId: string
) {
  const blockRewards = curationMetadataRef.collection(
    'curationBlockRewards'
  ) as FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc>;
  const periodRewards = curationMetadataRef.collection(
    'curationPeriodRewards'
  ) as FirebaseFirestore.CollectionReference<CurationPeriodDoc>;

  const mostRecentBlocksQuery = blockRewards.orderBy('timestamp', 'desc').limit(2);
  const mostRecentPeriodQuery = periodRewards.orderBy('timestamp', 'desc').limit(2);

  const mostRecentBlocksSnapshot = await mostRecentBlocksQuery.get();
  const mostRecentPeriodsSnapshot = await mostRecentPeriodQuery.get();

  const mostRecentBlocks = await Promise.all(
    mostRecentBlocksSnapshot.docs.map(async (doc) => {
      const docData = doc.data();
      const blockUsers = await CurationBlock.getBlockUsers(doc.ref);
      return {
        ...docData,
        users: blockUsers
      };
    })
  );

  const mostRecentPeriods = await Promise.all(
    mostRecentPeriodsSnapshot.docs.map(async (doc) => {
      const docData = doc.data();
      return {
        ...docData,
        users: await CurationPeriodAggregator.getCurationPeriodUsers(doc.ref)
      };
    })
  );

  const [currentBlock, prevBlock] = mostRecentBlocks;
  const [currentPeriod, prevPeriod] = mostRecentPeriods;

  const sortUsersByPeriodProtocolFees = (users: CurationPeriodUsers) => {
    return Object.values(users).sort((a, b) => {
        return b.periodProtocolFeesAccruedEth - a.periodProtocolFeesAccruedEth
    })
  };
  const sortUsersByBlockProtocolFees = (users: CurationUsers) => {
    return Object.values(users).sort((a, b) => {
        return b.blockProtocolFeesAccruedEth - a.blockProtocolFeesAccruedEth
    })
  };

  const sortUsersByTotalProtocolFees = (users: CurationUsers) => {
    return Object.values(users).sort((a, b) => {
        return b.totalProtocolFeesAccruedEth - a.totalProtocolFeesAccruedEth
    });
  };

  const currentBlockTopUsers = sortUsersByBlockProtocolFees(currentBlock?.users ?? {});
  const prevBlockTopUsers = sortUsersByBlockProtocolFees(prevBlock?.users ?? {});
  const currentPeriodTopUsers = sortUsersByPeriodProtocolFees(currentPeriod?.users ?? {});
  const prevPeriodTopUsers = sortUsersByPeriodProtocolFees(prevPeriod?.users ?? {});
  const currentTopUsers = sortUsersByTotalProtocolFees(currentBlock?.users ?? {});

  const numTopUsers = 10;
  const currentCurationSnippet: CurrentCurationSnippetDoc = {
    currentPeriod,
    currentBlock,
    prevPeriod,
    prevBlock,
    prevPeriodTopUsers: prevPeriodTopUsers.slice(0, numTopUsers),
    currentPeriodTopUsers: currentPeriodTopUsers.slice(0, numTopUsers),
    prevBlockTopUsers: prevBlockTopUsers.slice(0, numTopUsers),
    currentBlockTopUsers: currentBlockTopUsers.slice(0, numTopUsers),
  };
}
