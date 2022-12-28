import {
  CurationPeriod,
  CurationPeriodDoc,
  CurationPeriodStats,
  StakerContractPeriodDoc,
  StakerContractPeriodMetadata,
  StakerContractPeriodStats,
  StakerContractPeriodUserDoc
} from '@infinityxyz/lib/types/core';
import { firestoreConstants, formatEth } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';

import { StakerContractCurationPeriodUsers } from './staker-contract-curation-period-users';

export class StakerContractCurationPeriod {
  protected _users: StakerContractCurationPeriodUsers;

  get ref() {
    return this._db
      .collection(firestoreConstants.STAKING_CONTRACTS_COLL)
      .doc(`${this._metadata.stakerContractChainId}:${this._metadata.stakerContractAddress}`)
      .collection(firestoreConstants.STAKER_CONTRACT_CURATION_PERIODS_COLL)
      .doc(`${this._metadata.timestamp}`) as FirebaseFirestore.DocumentReference<StakerContractPeriodDoc>;
  }

  get usersRef() {
    return this.ref.collection(
      firestoreConstants.STAKER_CONTRACT_CURATION_PERIOD_USERS_COLL
    ) as FirebaseFirestore.CollectionReference<StakerContractPeriodUserDoc>;
  }

  constructor(protected _metadata: StakerContractPeriodMetadata, protected _db: FirebaseFirestore.Firestore) {
    this._users = new StakerContractCurationPeriodUsers(this._metadata);
  }

  async aggregatePeriod(
    periodsStream: AsyncGenerator<{
      curationPeriod: CurationPeriod;
      ref: FirebaseFirestore.DocumentReference<CurationPeriodDoc>;
    }>
  ) {
    const stakerContractPeriod: StakerContractPeriodDoc = {
      metadata: this._metadata,
      stats: this._getInitialPeriodStats()
    };

    const batch = new BatchHandler();
    for await (const { curationPeriod, ref } of periodsStream) {
      this._users.update(curationPeriod.users ?? {});
      const stakerStats = this._getUpdatedStakerPeriodStats(stakerContractPeriod.stats, curationPeriod.stats);
      stakerContractPeriod.stats = { ...stakerStats, totalCurators: this._users.size };

      const update: Partial<CurationPeriodDoc['metadata']> = {
        isAggregated: true
      };
      await batch.addAsync(ref, { metadata: update }, { merge: true });
    }

    const updatedAt = Date.now();
    for (const user of this._users.array) {
      const userRer = this.usersRef.doc(user.metadata.userAddress);
      await batch.addAsync(userRer, { ...user, updatedAt }, { merge: false });
    }

    const stakerContractPeriodUpdate: StakerContractPeriodDoc = {
      ...stakerContractPeriod,
      metadata: {
        ...stakerContractPeriod.metadata,
        updatedAt,
        trigger: false
      }
    };

    await batch.addAsync(this.ref, stakerContractPeriodUpdate, { merge: false });

    await batch.flush();
  }

  protected _getInitialPeriodStats(): StakerContractPeriodStats {
    return {
      periodProtocolFeesAccruedWei: '0',
      periodProtocolFeesAccruedEth: 0,
      arbitrageProtocolFeesAccruedWei: '0',
      arbitrageProtocolFeesAccruedEth: 0,
      periodPayoutWei: '0',
      periodPayoutEth: 0,
      totalCurators: 0,
      numCollections: 0
    };
  }

  protected _getUpdatedStakerPeriodStats(
    stakerStats: Omit<StakerContractPeriodStats, 'totalCurators'>,
    collectionPeriodStats: CurationPeriodStats
  ): Omit<StakerContractPeriodStats, 'totalCurators'> {
    const periodProtocolFeesAccruedWei = (
      BigInt(stakerStats.periodProtocolFeesAccruedWei) + BigInt(collectionPeriodStats.periodProtocolFeesAccruedWei)
    ).toString();
    const arbitrageProtocolFeesAccruedWei = (
      BigInt(stakerStats.arbitrageProtocolFeesAccruedWei) +
      BigInt(collectionPeriodStats.arbitrageProtocolFeesAccruedWei)
    ).toString();
    const periodPayoutWei = (
      BigInt(stakerStats.periodPayoutWei) + BigInt(collectionPeriodStats.periodPayoutWei)
    ).toString();
    return {
      periodProtocolFeesAccruedWei: periodProtocolFeesAccruedWei,
      periodProtocolFeesAccruedEth: formatEth(periodProtocolFeesAccruedWei),
      arbitrageProtocolFeesAccruedWei: arbitrageProtocolFeesAccruedWei,
      arbitrageProtocolFeesAccruedEth: formatEth(arbitrageProtocolFeesAccruedWei),
      periodPayoutWei: periodPayoutWei,
      periodPayoutEth: formatEth(periodPayoutWei),
      numCollections: stakerStats.numCollections + 1
    };
  }
}
