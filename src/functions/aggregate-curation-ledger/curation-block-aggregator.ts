import {
  ChainId,
  CollectionDisplayData,
  Erc20TokenMetadata,
  StakeDuration,
  StatsPeriod
} from '@infinityxyz/lib/types/core';
import {
  CurationBlockRewardsDoc,
  CurationBlockRewards,
  CurationBlockUsers,
  CurationBlockUser,
  CurationLedgerEventsWithStake
} from '@infinityxyz/lib/types/core/curation-ledger';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getStatsDocInfo } from '../aggregate-sales-stats/utils';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { streamQuery } from '../../firestore/stream-query';
import { CurationBlock } from './curation-block';
import { CurationMetadata } from './types';
import { getTokenPrice } from '../../token-price';
import { UserProfileDto } from '@infinityxyz/lib/types/dto/user';

const ONE_HOUR = 60 * 60 * 1000;
export class CurationBlockAggregator {
  static readonly DURATION = ONE_HOUR;

  static getCurationBlockRange(timestamp: number) {
    const startTimestamp = getStatsDocInfo(timestamp, StatsPeriod.Hourly).timestamp;
    const endTimestamp = startTimestamp + CurationBlockAggregator.DURATION;
    const prevTimestamp = getStatsDocInfo(startTimestamp - 1, StatsPeriod.Hourly).timestamp;
    return { startTimestamp, endTimestamp, prevTimestamp };
  }

  private _curationBlocks: Map<number, CurationBlock> = new Map();

  private get _blockRewards(): FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc> {
    return this._stakerContractCurationMetadataRef.collection(
      firestoreConstants.CURATION_BLOCK_REWARDS_COLL
    ) as FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc>;
  }

  constructor(
    private _curationEvents: CurationLedgerEventsWithStake[],
    private _stakerContractCurationMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>,
    private _collectionAddress: string,
    private _chainId: ChainId,
    private _stakerContractAddress: string,
    private _stakerContractChainId: ChainId,
    private _token: Erc20TokenMetadata
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
          chainId: this._chainId,
          stakerContractAddress: this._stakerContractAddress,
          stakerContractChainId: this._stakerContractChainId,
          token: this._token
        });
        this._curationBlocks.set(startTimestamp, block);
        block.addEvent(event);
      }
    }
  }

  async aggregate(collection: CollectionDisplayData) {
    let prevBlockRewards: CurationBlockRewards | undefined;
    for (const [, block] of this._curationBlocks) {
      if (!prevBlockRewards) {
        prevBlockRewards = await this.getPrevCurationBlockRewards(block.metadata.blockStart, this._blockRewards);
      }
      const { otherPerToken: tokenPrice } = await getTokenPrice(this._token, block.blockNumber);

      const { blockRewards, usersRemoved, usersAdded } = block.getBlockRewards(
        prevBlockRewards,
        tokenPrice,
        collection
      );
      await this.saveCurationBlockRewards(blockRewards, usersRemoved, usersAdded);
      prevBlockRewards = blockRewards;
    }
  }

  async saveCurationBlockRewards(
    curationBlockRewards: CurationBlockRewards,
    usersRemoved: CurationBlockUsers,
    usersAdded: CurationBlockUsers
  ) {
    const { users, ...curationBlockRewardsDoc } = curationBlockRewards;

    const docId = `${curationBlockRewardsDoc.metadata.timestamp}`;
    const blockRewardsRef = this._blockRewards.doc(docId);

    const batch = new FirestoreBatchHandler();
    batch.add(blockRewardsRef, curationBlockRewardsDoc, { merge: false });
    for (const userAddress of Object.keys(usersRemoved)) {
      const userRef = blockRewardsRef.collection(firestoreConstants.CURATION_BLOCK_USER_REWARDS_COLL).doc(userAddress);
      batch.delete(userRef);
    }

    for (const [userAddress, user] of Object.entries(users)) {
      if (usersAdded[userAddress]) {
        const userSnap = await this._blockRewards.firestore
          .collection(firestoreConstants.USERS_COLL)
          .doc(userAddress)
          .get();
        const userProfile = userSnap.data() ?? ({} as UserProfileDto);
        user.user = {
          address: userAddress,
          displayName: userProfile.displayName || '',
          username: userProfile.username || '',
          profileImage: userProfile.profileImage || '',
          bannerImage: userProfile.bannerImage || ''
        };
      }
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
    const snapshot = await curationRewardsRef
      .where('timestamp', '<=', timestamp)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    const prevBlockRewardsDoc = snapshot.docs[0];
    let prevBlockRewardsData = prevBlockRewardsDoc?.data();
    if (!prevBlockRewardsData) {
      prevBlockRewardsData = {
        collection: {} as any,
        metadata: {
          collectionAddress: this._collectionAddress,
          collectionChainId: this._chainId,
          timestamp,
          isAggregated: false,
          stakerContractAddress: this._stakerContractAddress,
          stakerContractChainId: this._stakerContractChainId,
          blockNumber: 0,
          tokenContractAddress: this._token.address,
          tokenContractChainId: this._token.chainId,
          blockDuration: CurationBlockAggregator.DURATION
        },
        stats: {
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
          tokenPrice: 0,
          avgStakePowerPerToken: 0,
          blockApr: 0,
          arbitrageClaimedWei: '0',
          arbitrageClaimedEth: 0,
          blockPayoutWei: '0',
          blockPayoutEth: 0,
          blockAprByMultiplier: {
            [StakeDuration.None]: 0,
            [StakeDuration.ThreeMonths]: 0,
            [StakeDuration.SixMonths]: 0,
            [StakeDuration.TwelveMonths]: 0
          }
        }
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
      users[user.metadata.userAddress] = user;
    }
    return {
      ...prevBlockRewardsData,
      users
    };
  }
}
