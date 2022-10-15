import { ChainId } from '@infinityxyz/lib/types/core';
import { RageQuitEvent, TokensUnStakedEvent } from '@infinityxyz/lib/types/core/StakerEvents';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import {
  CurationLedgerEvent,
  CurationLedgerVotesRemovedWithStake,
  CurationVotesRemoved
} from '@infinityxyz/lib/types/core/curation-ledger';
import { UserStakeDto } from '@infinityxyz/lib/types/dto/user';
import { UserCuratedCollectionDto } from '@infinityxyz/lib/types/dto';

export async function removeUserCollectionVotes(
  user: string,
  db: FirebaseFirestore.Firestore,
  event: TokensUnStakedEvent | RageQuitEvent
) {
  const userStakeRef = db
    .collection(firestoreConstants.USERS_COLL)
    .doc(user)
    .collection(firestoreConstants.USER_CURATION_COLL)
    .doc(
      `${event.stakerContractChainId}:${event.stakerContractAddress}`
    ) as FirebaseFirestore.DocumentReference<UserStakeDto>;

  const unVoter = getUnVoter(user, userStakeRef, event);

  console.log(`[${user}] Starting vote removal...`);
  let votesRemoved = 0;
  let collectionsRemoved = 0;
  let page = 0;
  let currentUserStake;
  try {
    for await (const { updatedUser, totalCollectionsRemoved, totalVotesRemoved } of unVoter) {
      votesRemoved = totalVotesRemoved;
      collectionsRemoved = totalCollectionsRemoved;
      page += 1;
      currentUserStake = updatedUser;
      console.log(
        `[${user}] Page: ${page} Total collections removed: ${totalCollectionsRemoved} Total votes removed: ${totalVotesRemoved} User stake power: ${
          currentUserStake.stakePower
        } User votes: ${currentUserStake.totalCuratedVotes} Votes to remove: ${
          currentUserStake.stakePower - currentUserStake.totalCuratedVotes
        }`
      );
    }
    console.log(
      `[${user}] Vote removal complete. Votes removed: ${votesRemoved} Collections removed: ${collectionsRemoved}. User stake power: ${currentUserStake?.stakePower} User votes: ${currentUserStake?.totalCuratedVotes}`
    );
    if (
      currentUserStake?.stakePower &&
      currentUserStake?.totalCuratedVotes &&
      currentUserStake.stakePower < currentUserStake.totalCuratedVotes
    ) {
      throw new Error(
        `[${user} User stake power is less than total votes. User stake power: ${currentUserStake.stakePower} User votes: ${currentUserStake.totalCuratedVotes}`
      );
    }
  } catch (err) {
    console.error(`[${user} Failed to complete vote removal`, err);
    throw err;
  }
}

export async function* getUnVoter(
  userAddress: string,
  userStakeRef: FirebaseFirestore.DocumentReference<UserStakeDto>,
  event: TokensUnStakedEvent | RageQuitEvent
) {
  const curatedCollectionsQuery = userStakeRef.firestore
    .collectionGroup(firestoreConstants.COLLECTION_CURATORS_COLL)
    .where('curator.address', '==', userAddress)
    .where('stakerContractChainId', '==', event.stakerContractChainId)
    .where(
      'stakerContractAddress',
      '==',
      event.stakerContractAddress
    ) as FirebaseFirestore.Query<UserCuratedCollectionDto>;

  const pageSize = 200;
  let lastCollectionProcessed: FirebaseFirestore.DocumentReference<UserCuratedCollectionDto> | undefined = undefined;
  const pageQuery = () => {
    const query = curatedCollectionsQuery.orderBy('address', 'asc').limit(pageSize);
    if (lastCollectionProcessed) {
      query.startAfter(lastCollectionProcessed);
    }
    return query;
  };

  let collectionsRemovedInAllPages = 0;
  let votesRemovedInAllPages = 0;

  while (true) {
    const { userStake } = await userStakeRef.firestore.runTransaction<{ userStake: UserStakeDto }>(async (txn) => {
      const userStakeSnap = await txn.get(userStakeRef);
      const userStake = userStakeSnap.data();
      if (!userStake) {
        throw new Error(`User ${userStakeRef.path} not found`);
      }
      let totalCuratedVotes = userStake.totalCuratedVotes ?? 0;
      let totalCurated = userStake.totalCurated ?? 0;
      const userVotesAvailable = userStake.stakePower ?? 0;
      const userVotesToRemove = totalCuratedVotes - userVotesAvailable;

      if (userVotesToRemove <= 0) {
        return { userStake };
      }

      const collectionsSnap = await txn.get(pageQuery());
      if (collectionsSnap.size === 0) {
        throw new Error(`No more collections to remove. Votes to remove: ${userVotesToRemove}`);
      }

      const { totalVotesRemoved, numCollectionsRemoved } = removeVotesOnCollections(
        collectionsSnap,
        userVotesToRemove,
        event,
        txn,
        totalCuratedVotes
      );
      totalCurated -= numCollectionsRemoved;
      totalCuratedVotes = totalCuratedVotes - totalVotesRemoved;
      collectionsRemovedInAllPages += numCollectionsRemoved;
      votesRemovedInAllPages += totalVotesRemoved;

      const lastItem = collectionsSnap.docs.pop();
      lastCollectionProcessed = lastItem?.ref;

      userStake.totalCurated = totalCurated;
      userStake.totalCuratedVotes = totalCuratedVotes;

      txn.set(userStakeRef, userStake, { merge: true });
      return { userStake };
    });

    yield {
      updatedUser: userStake,
      totalVotesRemoved: votesRemovedInAllPages,
      totalCollectionsRemoved: collectionsRemovedInAllPages
    };

    if (!userStake.totalCuratedVotes || userStake.stakePower >= userStake.totalCuratedVotes) {
      break;
    }
  }
}

export function removeVotesOnCollections(
  collections: FirebaseFirestore.QuerySnapshot<UserCuratedCollectionDto>,
  votesToRemove: number,
  event: TokensUnStakedEvent | RageQuitEvent,
  txn: FirebaseFirestore.Transaction,
  totalCuratedVotes: number
): { totalVotesRemoved: number; numCollectionsRemoved: number } {
  let votesRemainingToBeRemoved = votesToRemove;
  const getUpdatedVotes = (
    collectionVotes: number,
    totalUserVotes: number,
    totalVotesToRemove: number,
    votesRemainingToBeRemoved: number
  ) => {
    const portionOfVotes = collectionVotes / totalUserVotes;
    const maxVotesToRemoveFromCollection = Math.ceil(portionOfVotes * totalVotesToRemove);
    const votesToRemoveFromCollection = Math.min(maxVotesToRemoveFromCollection, votesRemainingToBeRemoved);
    const updatedCollectionVotes = collectionVotes - votesToRemoveFromCollection;
    const updatedVotesRemainingToBeRemoved = votesRemainingToBeRemoved - votesToRemoveFromCollection;
    return {
      updatedCollectionVotes,
      votesRemainingToBeRemoved: updatedVotesRemainingToBeRemoved,
      votesToRemoveFromCollection: votesToRemoveFromCollection
    };
  };
  let numCollectionsRemoved = 0;

  for (const curatedCollectionSnap of collections.docs) {
    const curatedCollection = curatedCollectionSnap.data();
    const votes = curatedCollection.curator.votes ?? (curatedCollection as any).votes; // this is for backwards compatibility
    if (curatedCollection && votes) {
      const {
        updatedCollectionVotes,
        votesRemainingToBeRemoved: updatedVotesRemainingToBeRemoved,
        votesToRemoveFromCollection
      } = getUpdatedVotes(votes, totalCuratedVotes, votesToRemove, votesRemainingToBeRemoved);

      if (updatedCollectionVotes === 0) {
        numCollectionsRemoved += 1;
      }
      const collectionUpdate: Partial<UserCuratedCollectionDto> = {
        curator: {
          ...curatedCollection.curator,
          votes: updatedCollectionVotes
        }
      };
      votesRemainingToBeRemoved = updatedVotesRemainingToBeRemoved;

      txn.set(curatedCollectionSnap.ref, collectionUpdate, { merge: true });
      const ledgerEvent = getCurationLedgerVoteRemovedEvent(event, votesToRemoveFromCollection, {
        collectionAddress: curatedCollection.address,
        chainId: curatedCollection.chainId as ChainId
      });
      const stakingContractCurationMetadataRef = curatedCollectionSnap.ref.parent.parent;
      if (!stakingContractCurationMetadataRef) {
        throw new Error(`stakingContractCurationMetadataRef not found in ${curatedCollectionSnap.ref.path}`);
      }
      const ledgerEventRef = stakingContractCurationMetadataRef
        .collection(firestoreConstants.CURATION_LEDGER_COLL)
        .doc();
      txn.set(ledgerEventRef, ledgerEvent);
    }
  }

  return { totalVotesRemoved: votesToRemove, numCollectionsRemoved };
}

export function getCurationLedgerVoteRemovedEvent(
  stakerEvent: TokensUnStakedEvent | RageQuitEvent,
  votesRemoved: number,
  collection: { collectionAddress: string; chainId: ChainId }
): CurationVotesRemoved {
  const event: CurationLedgerVotesRemovedWithStake = {
    votes: votesRemoved,
    txHash: stakerEvent.txHash,
    userAddress: stakerEvent.user,
    discriminator: CurationLedgerEvent.VotesRemoved,
    blockNumber: stakerEvent.blockNumber,
    timestamp: stakerEvent.timestamp,
    updatedAt: Date.now(),
    isAggregated: false,
    isDeleted: false,
    isFeedUpdated: false,
    collectionAddress: collection.collectionAddress,
    collectionChainId: collection.chainId,
    stakerContractAddress: stakerEvent.stakerContractAddress,
    stakerContractChainId: stakerEvent.stakerContractChainId,
    stake: {
      stakeInfo: stakerEvent.stakeInfo,
      stakePower: stakerEvent.stakePower,
      stakePowerPerToken: stakerEvent.stakePowerPerToken,
      stakerEventTxHash: stakerEvent.txHash,
      stakerEventBlockNumber: stakerEvent.blockNumber
    },
    isStakeMerged: true,
    tokenContractAddress: '0x0',
    tokenContractChainId: ChainId.Mainnet
  };

  return event;
}
