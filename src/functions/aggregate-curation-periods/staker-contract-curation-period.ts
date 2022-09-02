import { CurationPeriod, CurationPeriodDoc, CurationPeriodStats } from '@infinityxyz/lib/types/core';
import { firestoreConstants, formatEth } from '@infinityxyz/lib/utils';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { StakerContractCurationPeriodUsers } from './staker-contract-curation-period-users';
import {
  StakerContractPeriodDoc,
  StakerContractPeriodMetadata,
  StakerContractPeriodStats,
  StakerContractPeriodUserDoc
} from './types';

export class StakerContractCurationPeriod {
  protected _users: StakerContractCurationPeriodUsers;

  get ref() {
    return this._db
      .collection(firestoreConstants.STAKING_CONTRACTS_COLL)
      .doc(`${this._metadata.stakerContractChainId}:${this._metadata.stakerContractAddress}`)
      .collection('stakerContractCurationPeriods')
      .doc(`${this._metadata.timestamp}`) as FirebaseFirestore.DocumentReference<StakerContractPeriodDoc>;
  }

  get usersRef() {
    return this.ref.collection(
      'stakerContractCurationPeriodsUsers'
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

    const batch = new FirestoreBatchHandler();
    for await (const { curationPeriod, ref } of periodsStream) {
      this._users.update(curationPeriod.users ?? {});
      const stakerStats = this._getUpdatedStakerPeriodStats(stakerContractPeriod.stats, curationPeriod.stats);
      stakerContractPeriod.stats = { ...stakerStats, totalCurators: this._users.size };

      const update: Partial<CurationPeriodDoc['metadata']> = {
        isAggregated: true
      };
      await batch.addAsync(ref, { metadata: update }, { merge: false });
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
        trigger: false,
      }
    };

    await batch.addAsync(this.ref, stakerContractPeriodUpdate, { merge: false });

    await batch.flush();
  }

  protected _getInitialPeriodStats(): StakerContractPeriodStats {
    return {
      totalProtocolFeesAccruedWei: '0',
      periodProtocolFeesAccruedWei: '0',
      totalProtocolFeesAccruedEth: 0,
      periodProtocolFeesAccruedEth: 0,
      arbitrageProtocolFeesAccruedWei: '0',
      arbitrageProtocolFeesAccruedEth: 0,
      totalArbitrageProtocolFeesAccruedWei: '0',
      totalArbitrageProtocolFeesAccruedEth: 0,
      periodPayoutWei: '0',
      periodPayoutEth: 0,
      totalCurators: 0,
      totalCollectionsCurated: 0
    };
  }

  protected _getUpdatedStakerPeriodStats(
    stakerStats: Omit<StakerContractPeriodStats, 'totalCurators'>,
    collectionPeriodStats: CurationPeriodStats
  ): Omit<StakerContractPeriodStats, 'totalCurators'> {
    const totalProtocolFeesAccruedWei = (
      BigInt(stakerStats.totalProtocolFeesAccruedWei) + BigInt(collectionPeriodStats.totalProtocolFeesAccruedWei)
    ).toString();
    const periodProtocolFeesAccruedWei = (
      BigInt(stakerStats.periodProtocolFeesAccruedWei) + BigInt(collectionPeriodStats.periodProtocolFeesAccruedWei)
    ).toString();
    const arbitrageProtocolFeesAccruedWei = (
      BigInt(stakerStats.arbitrageProtocolFeesAccruedWei) +
      BigInt(collectionPeriodStats.arbitrageProtocolFeesAccruedWei)
    ).toString();
    const totalArbitrageProtocolFeesAccruedWei = (
      BigInt(stakerStats.totalArbitrageProtocolFeesAccruedWei) +
      BigInt(collectionPeriodStats.totalArbitrageProtocolFeesAccruedWei)
    ).toString();
    const periodPayoutWei = (
      BigInt(stakerStats.periodPayoutWei) + BigInt(collectionPeriodStats.periodPayoutWei)
    ).toString();
    return {
      totalProtocolFeesAccruedWei: totalProtocolFeesAccruedWei,
      periodProtocolFeesAccruedWei: periodProtocolFeesAccruedWei,
      totalProtocolFeesAccruedEth: formatEth(totalProtocolFeesAccruedWei),
      periodProtocolFeesAccruedEth: formatEth(periodProtocolFeesAccruedWei),
      arbitrageProtocolFeesAccruedWei: arbitrageProtocolFeesAccruedWei,
      arbitrageProtocolFeesAccruedEth: formatEth(arbitrageProtocolFeesAccruedWei),
      totalArbitrageProtocolFeesAccruedWei: totalArbitrageProtocolFeesAccruedWei,
      totalArbitrageProtocolFeesAccruedEth: formatEth(totalArbitrageProtocolFeesAccruedWei),
      periodPayoutWei: periodPayoutWei,
      periodPayoutEth: formatEth(periodPayoutWei),
      totalCollectionsCurated: stakerStats.totalCollectionsCurated + 1
    };
  }
}
