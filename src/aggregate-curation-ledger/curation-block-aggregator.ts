import { ChainId, StatsPeriod } from '@infinityxyz/lib/types/core';
import {
  CurationBlockRewardsDoc,
  CurationLedgerEventType,
  CurationBlockRewards,
  CurationBlockUsers,
  CurationBlockUser
} from '@infinityxyz/lib/types/core/curation-ledger';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getStatsDocInfo } from '../aggregate-sales-stats/utils';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQuery } from '../firestore/stream-query';
import { CurationBlock } from './curation-block';
import { CurationMetadata } from './types';

export class CurationBlockAggregator {
  static getCurationBlockRange(timestamp: number) {
    const startTimestamp = getStatsDocInfo(timestamp, StatsPeriod.Hourly).timestamp;
    const oneHour = 60 * 60 * 1000;
    const endTimestamp = startTimestamp + oneHour;
    const prevTimestamp = getStatsDocInfo(startTimestamp - 1, StatsPeriod.Hourly).timestamp;
    return { startTimestamp, endTimestamp, prevTimestamp };
  }

  private _curationBlocks: Map<number, CurationBlock> = new Map();

  private get _blockRewards(): FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc> {
    return this._curationMetadataDocRef.collection(
      firestoreConstants.CURATION_BLOCK_REWARDS_COLL
    ) as FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc>;
  }

  constructor(
    private _curationEvents: CurationLedgerEventType[],
    private _curationMetadataDocRef: FirebaseFirestore.DocumentReference<CurationMetadata>,
    private _collectionAddress: string,
    private _chainId: ChainId
  ) {
    this._curationEvents = this._curationEvents.sort((a, b) => a.timestamp - b.timestamp);
    for (const event of this._curationEvents) {
      const { startTimestamp } = CurationBlockAggregator.getCurationBlockRange(event.timestamp);
      let block = this._curationBlocks.get(startTimestamp);
      if (block) {
        block.addEvent(event);
      } else {
        block = new CurationBlock({
          blockStart: startTimestamp,
          collectionAddress: this._collectionAddress,
          chainId: this._chainId
        });
        this._curationBlocks.set(startTimestamp, block);
        block.addEvent(event);
      }
    }
  }

  async aggregate() {
    let prevBlockRewards: CurationBlockRewards | undefined;
    for (const [, block] of this._curationBlocks) {
      if (!prevBlockRewards) {
        prevBlockRewards = await this.getPrevCurationBlockRewards(block.metadata.blockStart, this._blockRewards);
      }
      const { blockRewards, usersRemoved } = block.getBlockRewards(prevBlockRewards);
      await this.saveCurationBlockRewards(blockRewards, usersRemoved);
      prevBlockRewards = blockRewards;
    }
  }

  async saveCurationBlockRewards(curationBlockRewards: CurationBlockRewards, usersRemoved: CurationBlockUsers) {
    const { users, ...curationBlockRewardsDoc } = curationBlockRewards;

    const docId = `${curationBlockRewardsDoc.timestamp}`;
    const blockRewardsRef = this._blockRewards.doc(docId);

    const batch = new FirestoreBatchHandler();
    batch.add(blockRewardsRef, curationBlockRewardsDoc, { merge: false });
    for (const userAddress of Object.keys(usersRemoved)) {
      const userRef = blockRewardsRef.collection(firestoreConstants.CURATION_BLOCK_USER_REWARDS_COLL).doc(userAddress);
      batch.delete(userRef);
    }

    for (const [userAddress, user] of Object.entries(users)) {
      const userRef = blockRewardsRef.collection(firestoreConstants.CURATION_BLOCK_USER_REWARDS_COLL).doc(userAddress);
      batch.add(userRef, user, { merge: false });
    }
    await batch.flush();
  }

  async getPrevCurationBlockRewards(
    currentBlockStartTimestamp: number,
    curationRewardsRef: FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc>
  ): Promise<CurationBlockRewards> {
    const timestamp = CurationBlockAggregator.getCurationBlockRange(currentBlockStartTimestamp).prevTimestamp;
    const snapshot = await curationRewardsRef.where('timestamp', '<=', timestamp).limit(1).get();
    const prevBlockRewardsDoc = snapshot.docs[0];
    let prevBlockRewardsData = prevBlockRewardsDoc?.data();
    if (!prevBlockRewardsData) {
      prevBlockRewardsData = {
        collectionAddress: this._collectionAddress,
        chainId: this._chainId,
        numCurators: 0,
        numCuratorVotes: 0,
        numCuratorsAdded: 0,
        numCuratorsRemoved: 0,
        numCuratorVotesAdded: 0,
        numCuratorVotesRemoved: 0,
        numCuratorsPercentChange: 0,
        numCuratorVotesPercentChange: 0,
        totalProtocolFeesAccruedWei: '0',
        blockProtocolFeesAccruedWei: '0',
        arbitrageProtocolFeesAccruedWei: '0',
        totalProtocolFeesAccruedEth: 0,
        blockProtocolFeesAccruedEth: 0,
        arbitrageProtocolFeesAccruedEth: 0,
        timestamp,
        isAggregated: false
      };
      const prevBlockRewards = {
        ...prevBlockRewardsData,
        users: {}
      };
      return prevBlockRewards;
    }
    const usersQuery = prevBlockRewardsDoc.ref.collection(
      firestoreConstants.CURATION_BLOCK_USER_REWARDS_COLL
    ) as FirebaseFirestore.CollectionReference<CurationBlockUser>;
    const usersStream = streamQuery(usersQuery, (item, ref) => [ref], { pageSize: 300 });
    const users: CurationBlockUsers = {};
    for await (const user of usersStream) {
      users[user.userAddress] = user;
    }
    return {
      ...prevBlockRewardsData,
      users
    };
  }
}
