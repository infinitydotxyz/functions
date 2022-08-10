import {
  ChainId,
  RageQuitEvent,
  StakeInfo,
  StakerEvents,
  StakerEventType,
  TokensUnStakedEvent
} from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { UserProfileDto as IUserProfileDto } from '@infinityxyz/lib/types/dto/user/user-profile.dto';
import { CuratedCollectionDto } from '@infinityxyz/lib/types/dto/collections/curation/curated-collections.dto';
import { CurationLedgerEvent, CurationVotesRemoved } from '../aggregate-sales-stats/curation.types';

type UserStake = {
  stakeInfo: StakeInfo;
  stakePower: number;
  blockUpdatedAt: number;
};
type UserProfileDto = IUserProfileDto & {
  stake: UserStake;
};

export async function handleStakerEvent(
  event: StakerEvents,
  db: FirebaseFirestore.Firestore,
  eventRef: FirebaseFirestore.DocumentReference<StakerEvents>
): Promise<{ userStake: UserStake; totalCuratedVotes: number }> {
  const user = event.user;
  const userRef = db.collection(firestoreConstants.USERS_COLL).doc(user);
  const curatedCollectionsQuery = db
    .collectionGroup(firestoreConstants.COLLECTION_CURATORS_COLL)
    .where('userAddress', '==', user)
    .orderBy('votes', 'desc') as FirebaseFirestore.Query<CuratedCollectionDto>;

  const userStakeAndVotes = await db.runTransaction<{ userStake: UserStake; totalCuratedVotes: number }>(
    async (txn) => {
      const userSnap = await txn.get(userRef);
      const userData = userSnap.data() as UserProfileDto | undefined;
      const userStakeRequiresUpdate =
        !userData?.stake?.blockUpdatedAt ||
        (userData?.stake?.blockUpdatedAt && userData.stake.blockUpdatedAt < event.blockNumber);
      const eventUserStake = {
        stakeInfo: event.stakeInfo,
        stakePower: event.stakePower,
        blockUpdatedAt: event.blockNumber
      };
      const userStake = userStakeRequiresUpdate ? eventUserStake : userData?.stake;
      let totalCuratedVotes = userData?.totalCuratedVotes ?? 0;
      let totalCurated = userData?.totalCurated ?? 0;

      const votingPowerReduced =
        event.discriminator === StakerEventType.RageQuit || event.discriminator === StakerEventType.UnStaked;
      if (votingPowerReduced) {
        const userVotesAvailable = userStake.stakePower;
        const userVotesToRemove = userVotesAvailable - totalCuratedVotes;

        if (userVotesToRemove > 0) {
          const curatedCollectionsSnap = await txn.get(curatedCollectionsQuery.limit(210));
          if (curatedCollectionsSnap.size > 200) {
            console.error(`User ${user} has more than 200 curated collections!`);
          }
          const { totalVotesRemoved, numCollectionsRemoved } = removeVotesOnCollections(
            event.user,
            curatedCollectionsSnap,
            userVotesToRemove,
            event,
            txn,
            db
          );
          totalCurated -= numCollectionsRemoved;
          totalCuratedVotes = totalCuratedVotes - totalVotesRemoved;
        }
      }

      const userUpdate: Partial<UserProfileDto> = {
        totalCurated,
        totalCuratedVotes,
        stake: userStake
      };
      txn.set(userRef, userUpdate, { merge: true });
      const eventRefUpdate: Partial<StakerEvents> = {
        processed: true 
      }
      txn.set(eventRef, eventRefUpdate, { merge: true });
      return {
        userStake,
        totalCurated,
        totalCuratedVotes
      };
    }
  );

  return userStakeAndVotes;
}

export function getCurationLedgerVoteRemovedEvent(
  stakerEvent: TokensUnStakedEvent | RageQuitEvent,
  votesRemoved: number,
  collection: { collectionAddress: string; chainId: ChainId }
): CurationVotesRemoved {
  const event: CurationVotesRemoved = {
    votes: votesRemoved,
    txHash: stakerEvent.txHash,
    userAddress: stakerEvent.user,
    discriminator: CurationLedgerEvent.VotesRemoved,
    blockNumber: stakerEvent.blockNumber,
    timestamp: stakerEvent.timestamp,
    updatedAt: Date.now(),
    isAggregated: false,
    isDeleted: false,
    address: collection.collectionAddress,
    chainId: collection.chainId
  };

  return event;
}

export function removeVotesOnCollections(
  user: string,
  collections: FirebaseFirestore.QuerySnapshot<CuratedCollectionDto>,
  votesToRemove: number,
  event: TokensUnStakedEvent | RageQuitEvent,
  txn: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore
): { totalVotesRemoved: number; numCollectionsRemoved: number } {
  const totalVotesInCuratedCollections = collections.docs.reduce((acc, doc) => {
    const data = doc.data();
    if (data && data.votes) {
      return acc + data.votes;
    }
    return acc;
  }, 0);

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
    if (curatedCollection && curatedCollection.votes) {
      const {
        updatedCollectionVotes,
        votesRemainingToBeRemoved: updatedVotesRemainingToBeRemoved,
        votesToRemoveFromCollection
      } = getUpdatedVotes(
        curatedCollection.votes,
        totalVotesInCuratedCollections,
        votesToRemove,
        votesRemainingToBeRemoved
      );

      if (updatedCollectionVotes === 0) {
        numCollectionsRemoved += 1;
      }
      const collectionUpdate: Partial<CuratedCollectionDto> = {
        votes: updatedCollectionVotes
      };
      votesRemainingToBeRemoved = updatedVotesRemainingToBeRemoved;

      txn.set(curatedCollectionSnap.ref, collectionUpdate, { merge: true });
      const ledgerEvent = getCurationLedgerVoteRemovedEvent(event, votesToRemoveFromCollection, {
        collectionAddress: curatedCollection.address,
        chainId: curatedCollection.chainId as ChainId
      });
      const ledgerEventRef = db.collection('curationLedger').doc();
      txn.set(ledgerEventRef, ledgerEvent);
    }
  }
  if (votesRemainingToBeRemoved > 0) {
    throw new Error(
      `Failed to remove enough votes from collections for user: ${user}. Remaining votes: ${votesRemainingToBeRemoved}`
    );
  }
  return { totalVotesRemoved: votesToRemove, numCollectionsRemoved };
}
