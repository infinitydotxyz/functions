import { ChainId } from '@infinityxyz/lib/types/core';
import { RageQuitEvent, TokensUnStakedEvent } from '@infinityxyz/lib/types/core/StakerEvents';
import { CuratedCollectionDto } from '@infinityxyz/lib/types/dto/collections/curation/curated-collections.dto';
import { UserProfileDto } from '@infinityxyz/lib/types/dto/user/user-profile.dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { CurationLedgerEvent, CurationVotesRemoved } from '@infinityxyz/lib/types/core/curation-ledger';

export async function removeUserCollectionVotes(
  user: string,
  db: FirebaseFirestore.Firestore,
  event: TokensUnStakedEvent | RageQuitEvent
) {
  const userRef = db
    .collection(firestoreConstants.USERS_COLL)
    .doc(user) as FirebaseFirestore.DocumentReference<UserProfileDto>;

  const unVoter = getUnVoter(userRef, event);

  console.log(`[${user}] Starting vote removal...`);
  let votesRemoved = 0;
  let collectionsRemoved = 0;
  let page = 0;
  let currentUser;
  try {
    for await (const { updatedUser, totalCollectionsRemoved, totalVotesRemoved } of unVoter) {
      votesRemoved = totalVotesRemoved;
      collectionsRemoved = totalCollectionsRemoved;
      page += 1;
      currentUser = updatedUser;
      console.log(
        `[${user}] Page: ${page} Total collections removed: ${totalCollectionsRemoved} Total votes removed: ${totalVotesRemoved} User stake power: ${
          currentUser.stake.stakePower
        } User votes: ${currentUser.totalCuratedVotes} Votes to remove: ${
          currentUser.stake.stakePower - currentUser.totalCuratedVotes
        }`
      );
    }
    console.log(
      `[${user}] Vote removal complete. Votes removed: ${votesRemoved} Collections removed: ${collectionsRemoved}. User stake power: ${currentUser?.stake.stakePower} User votes: ${currentUser?.totalCuratedVotes}`
    );
    if (
      currentUser?.stake?.stakePower &&
      currentUser?.totalCuratedVotes &&
      currentUser.stake.stakePower < currentUser.totalCuratedVotes
    ) {
      throw new Error(
        `[${user} User stake power is less than total votes. User stake power: ${currentUser.stake.stakePower} User votes: ${currentUser.totalCuratedVotes}`
      );
    }
  } catch (err) {
    console.error(`[${user} Failed to complete vote removal`, err);
  }
}

export async function* getUnVoter(
  userRef: FirebaseFirestore.DocumentReference<UserProfileDto>,
  event: TokensUnStakedEvent | RageQuitEvent
) {
  const curatedCollectionsQuery = userRef.firestore
    .collectionGroup(firestoreConstants.COLLECTION_CURATORS_COLL)
    .where('user', '==', userRef.id) as FirebaseFirestore.Query<CuratedCollectionDto>;
  const pageSize = 200;
  let lastCollectionProcessed: FirebaseFirestore.DocumentReference<CuratedCollectionDto> | undefined = undefined;
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
    const { user } = await userRef.firestore.runTransaction<{ user: UserProfileDto }>(async (txn) => {
      const userSnap = await txn.get(userRef);
      const user = userSnap.data();
      if (!user) {
        throw new Error(`User ${userRef.id} not found`);
      }
      let totalCuratedVotes = user.totalCuratedVotes ?? 0;
      let totalCurated = user.totalCurated ?? 0;
      const userVotesAvailable = user.stake.stakePower;
      const userVotesToRemove = userVotesAvailable - totalCuratedVotes;
      if (userVotesToRemove <= 0) {
        return { user };
      }

      const collectionsSnap = await txn.get(pageQuery());

      const { totalVotesRemoved, numCollectionsRemoved } = removeVotesOnCollections(
        collectionsSnap,
        userVotesToRemove,
        event,
        txn,
        userRef.firestore,
        totalCuratedVotes
      );
      totalCurated -= numCollectionsRemoved;
      totalCuratedVotes = totalCuratedVotes - totalVotesRemoved;
      collectionsRemovedInAllPages += numCollectionsRemoved;
      votesRemovedInAllPages += totalVotesRemoved;

      const lastItem = collectionsSnap.docs.pop();
      lastCollectionProcessed = lastItem?.ref;

      user.totalCurated = totalCurated;
      user.totalCuratedVotes = totalCuratedVotes;

      txn.set(userRef, user, { merge: true });
      return { user };
    });

    yield {
      updatedUser: user,
      totalVotesRemoved: votesRemovedInAllPages,
      totalCollectionsRemoved: collectionsRemovedInAllPages
    };

    if (user.stake.stakePower >= user.totalCuratedVotes) {
      break;
    }
  }
}

export function removeVotesOnCollections(
  collections: FirebaseFirestore.QuerySnapshot<CuratedCollectionDto>,
  votesToRemove: number,
  event: TokensUnStakedEvent | RageQuitEvent,
  txn: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
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
    if (curatedCollection && curatedCollection.votes) {
      const {
        updatedCollectionVotes,
        votesRemainingToBeRemoved: updatedVotesRemainingToBeRemoved,
        votesToRemoveFromCollection
      } = getUpdatedVotes(curatedCollection.votes, totalCuratedVotes, votesToRemove, votesRemainingToBeRemoved);

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

  return { totalVotesRemoved: votesToRemove, numCollectionsRemoved };
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
