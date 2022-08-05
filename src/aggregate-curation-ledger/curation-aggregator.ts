import { StatsPeriod } from '@infinityxyz/lib/types/core';
import { CurationLedgerEventType } from '../aggregate-sales-stats/curation.types';
import { getStatsDocInfo } from '../aggregate-sales-stats/utils';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQuery } from '../firestore/stream-query';
import { CurationBlock } from './curation-block';
import { CurationBlockRewardsDoc, CurationBlockRewards, CurationUser, CurationUsers, CurationMetadata } from './types';

export class CurationAggregator {
  static getCurationBlockRange(timestamp: number) {
    const startTimestamp = getStatsDocInfo(timestamp, StatsPeriod.Daily).timestamp;
    const oneDay = 24 * 60 * 60 * 1000;
    const endTimestamp = startTimestamp + oneDay;
    const prevTimestamp = getStatsDocInfo(startTimestamp - 1, StatsPeriod.Daily).timestamp;
    return { startTimestamp, endTimestamp, prevTimestamp };
  }

  private _curationBlocks: Map<number, CurationBlock> = new Map();

  private get _rewardsRef(): FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc> {
    return this._curationMetadataDocRef.collection('curationRewards') as FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc>;
  }

  constructor(
    private _curationEvents: CurationLedgerEventType[],
    private _curationMetadataDocRef: FirebaseFirestore.DocumentReference<CurationMetadata>
  ) {
    this._curationEvents = this._curationEvents.sort((a, b) => a.timestamp - b.blockNumber);
    for (const event of this._curationEvents) {
      const { startTimestamp } = CurationAggregator.getCurationBlockRange(event.timestamp);
      let block = this._curationBlocks.get(startTimestamp);
      if (block) {
        block.addEvent(event);
      } else {
        block = new CurationBlock({
          blockStart: startTimestamp
        });
        this._curationBlocks.set(startTimestamp, block);
        block.addEvent(event);
      }
    }
  }

  async aggregate() {
    let prevBlockRewards: CurationBlockRewards | undefined;
    for(const [,block] of this._curationBlocks) {
        if(!prevBlockRewards) {
            prevBlockRewards = await this.getPrevCurationBlockRewards(block.metadata.blockStart, this._rewardsRef);
        }
        const { blockRewards } = block.getBlockRewards(prevBlockRewards);
        await this.saveCurationBlockRewards(blockRewards);
        prevBlockRewards = blockRewards;
    }
  }

  async saveCurationBlockRewards(curationBlockRewards: CurationBlockRewards) {
    const { users, ...curationBlockRewardsDoc } = curationBlockRewards;

    const docId = `${curationBlockRewardsDoc.startTimestamp}`;
    const blockRewardsRef = this._rewardsRef.doc(docId);
    const batch = new FirestoreBatchHandler();

    batch.add(blockRewardsRef, curationBlockRewardsDoc, { merge: false });
    for (const [userAddress, user] of Object.entries(users)) {
        const userRef = blockRewardsRef.collection('curationBlockUserRewards').doc(userAddress); 
        batch.add(userRef, user, { merge: false });
    }

    await batch.flush();
  }

  async getPrevCurationBlockRewards(
    currentBlockStartTimestamp: number,
    curationRewardsRef: FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc>
  ): Promise<CurationBlockRewards> {
    const timestamp = CurationAggregator.getCurationBlockRange(currentBlockStartTimestamp).prevTimestamp;
    const snapshot = await curationRewardsRef.where('startTimestamp', '<=', timestamp).limit(1).get();
    const prevBlockRewardsDoc = snapshot.docs[0];
    let prevBlockRewardsData = prevBlockRewardsDoc?.data();
    if (!prevBlockRewardsData) {
      prevBlockRewardsData = {
        numCurators: 0,
        numCuratorVotes: 0,
        totalProtocolFeesAccruedWei: '0',
        blockProtocolFeesAccruedWei: '0',
        startTimestamp: timestamp
      };
      const prevBlockRewards = {
        ...prevBlockRewardsData,
        users: {}
      };
      return prevBlockRewards;
    }
    const usersQuery = prevBlockRewardsDoc.ref.collection(
      'curationBlockUserRewards'
    ) as FirebaseFirestore.CollectionReference<CurationUser>;
    const usersStream = streamQuery(usersQuery, (item, ref) => [ref], { pageSize: 300 });
    const users: CurationUsers = {};
    for await (const user of usersStream) {
      users[user.userAddress] = user;
    }
    return {
      ...prevBlockRewardsData,
      users
    };
  }
}
