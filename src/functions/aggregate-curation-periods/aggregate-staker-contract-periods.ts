import {
  ChainId,
  CurationPeriod,
  CurationPeriodDoc,
  CurationPeriodUser,
  StakerContractPeriodMetadata
} from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { streamQuery, streamQueryWithRef } from '@/firestore/stream-query';
import { Firestore } from '@/firestore/types';

import { StakerContractCurationPeriod } from './staker-contract-curation-period';

export async function aggregateStakerContractPeriods(
  db: FirebaseFirestore.Firestore,
  metadata: StakerContractPeriodMetadata
) {
  const curationPeriodStream = collectionCurationPeriods(
    db,
    metadata.stakerContractAddress,
    metadata.stakerContractChainId,
    metadata.timestamp
  );

  const stakerContractCurationPeriod = new StakerContractCurationPeriod(metadata, db);
  await stakerContractCurationPeriod.aggregatePeriod(curationPeriodStream);
}

export async function* collectionCurationPeriods(
  db: Firestore,
  stakerContractAddress: string,
  stakerContractChainId: ChainId,
  timestamp: number
): AsyncGenerator<{ curationPeriod: CurationPeriod; ref: FirebaseFirestore.DocumentReference<CurationPeriodDoc> }> {
  const collectionCurationPeriods = db.collectionGroup(firestoreConstants.CURATION_PERIOD_REWARDS_COLL);

  const query = collectionCurationPeriods
    .where('metadata.stakerContractAddress', '==', stakerContractAddress)
    .where('metadata.stakerContractChainId', '==', stakerContractChainId)
    .where('metadata.timestamp', '==', timestamp)
    .orderBy('metadata.collectionAddress', 'desc') as FirebaseFirestore.Query<CurationPeriodDoc>;

  const stream = streamQueryWithRef(query, (_, ref) => [ref], { pageSize: 300 });

  for await (const { data: period, ref } of stream) {
    const address = period?.collection?.address || period?.metadata?.collectionAddress;
    if (address) {
      const curationPeriod: CurationPeriod = {
        ...period,
        users: {}
      };
      const usersRef = ref.collection(
        firestoreConstants.CURATION_PERIOD_USER_REWARDS_COLL
      ) as FirebaseFirestore.CollectionReference<CurationPeriodUser>;
      const userStream = streamQuery(usersRef, (_, userRef) => [userRef], { pageSize: 300 });

      for await (const user of userStream) {
        if (user && user.metadata.userAddress) {
          curationPeriod.users[user.metadata.userAddress] = user;
        }
      }

      yield { curationPeriod, ref };
    }
  }
}
