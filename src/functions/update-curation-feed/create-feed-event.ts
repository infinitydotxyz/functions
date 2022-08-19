import {
  Collection,
  CurationLedgerEvent,
  CurationLedgerEvents,
  CurationVotesAdded,
  CurationVotesRemoved,
  EventType,
  InfinityLinkType,
  UserVoteEvent,
  UserVoteRemovedEvent
} from '@infinityxyz/lib/types/core';
import { UserProfileDto } from '@infinityxyz/lib/types/dto/user/user-profile.dto';
import { firestoreConstants, getInfinityLink } from '@infinityxyz/lib/utils';

export async function createFeedEventForLedgerEvent(
  ledgerEventRef: FirebaseFirestore.DocumentReference<CurationLedgerEvents>
) {
  const db = ledgerEventRef.firestore;
  await db.runTransaction(async (txn) => {
    const feedRef = db.collection(firestoreConstants.FEED_COLL);
    const ledgerEventSnap = await txn.get(ledgerEventRef);
    const ledgerEvent = ledgerEventSnap.data();
    if (ledgerEvent && 'isFeedUpdated' in ledgerEvent && ledgerEvent.isFeedUpdated === false && ledgerEvent.discriminator === CurationLedgerEvent.VotesAdded || ledgerEvent?.discriminator === CurationLedgerEvent.VotesRemoved) {
      const userRef = db.collection(firestoreConstants.USERS_COLL).doc(ledgerEvent.userAddress);
      const collectionRef = ledgerEventRef.parent.parent?.parent.parent;
      if (!collectionRef) {
        throw new Error('Collection ref not found');
      }
      const collectionSnap = await txn.get(collectionRef);
      const userProfileSnap = await txn.get(userRef);
      const userProfile = (userProfileSnap.data() ?? {}) as Partial<UserProfileDto>;
      const collection: Partial<Collection> = collectionSnap.data() ?? {};

      let event: UserVoteEvent | UserVoteRemovedEvent;

      switch (ledgerEvent.discriminator) {
        case CurationLedgerEvent.VotesAdded: {
          const voteEvent: UserVoteEvent = {
            type: EventType.UserVote,
            votesAdded: ledgerEvent.votes,
            timestamp: ledgerEvent.timestamp,
            userAddress: ledgerEvent.userAddress,
            userUsername: userProfile.username || '',
            userDisplayName: userProfile.displayName || '',
            userProfileImage: userProfile.profileImage || '',
            likes: 0,
            comments: 0,
            usersInvolved: [ledgerEvent.userAddress],
            stakerContractAddress: ledgerEvent.stakerContractAddress,
            stakerContractChainId: ledgerEvent.stakerContractChainId,
            chainId: ledgerEvent.collectionChainId,
            collectionAddress: ledgerEvent.collectionAddress,
            collectionName: collection?.metadata?.name || '',
            collectionSlug: collection?.slug || '',
            collectionProfileImage: collection?.metadata?.profileImage || '',
            hasBlueCheck: collection.hasBlueCheck || false,
            internalUrl: getInfinityLink({
              type: InfinityLinkType.Collection,
              addressOrSlug: ledgerEvent.collectionAddress,
              chainId: ledgerEvent.collectionChainId
            }),
            tokenContractAddress: ledgerEvent.tokenContractAddress,
            tokenContractChainId: ledgerEvent.tokenContractChainId
          };
          event = voteEvent;
          break;
        }
        case CurationLedgerEvent.VotesRemoved: {
          const voteRemovedEvent: UserVoteRemovedEvent = {
            type: EventType.UserVoteRemoved,
            votesRemoved: ledgerEvent.votes,
            timestamp: ledgerEvent.timestamp,
            userAddress: ledgerEvent.userAddress,
            userUsername: userProfile.username || '',
            userDisplayName: userProfile.displayName || '',
            userProfileImage: userProfile.profileImage || '',
            likes: 0,
            comments: 0,
            usersInvolved: [ledgerEvent.userAddress],
            stakerContractAddress: ledgerEvent.stakerContractAddress,
            stakerContractChainId: ledgerEvent.stakerContractChainId,
            chainId: ledgerEvent.collectionChainId,
            collectionAddress: ledgerEvent.collectionAddress,
            collectionName: collection?.metadata?.name || '',
            collectionSlug: collection?.slug || '',
            collectionProfileImage: collection?.metadata?.profileImage || '',
            hasBlueCheck: collection.hasBlueCheck || false,
            internalUrl: getInfinityLink({
              type: InfinityLinkType.Collection,
              addressOrSlug: ledgerEvent.collectionAddress,
              chainId: ledgerEvent.collectionChainId
            }),
            tokenContractAddress: ledgerEvent.tokenContractAddress,
            tokenContractChainId: ledgerEvent.tokenContractChainId
          };
          event = voteRemovedEvent;
          break;
        }

        default:
          throw new Error(`Unhandled event type ${(ledgerEvent as unknown as any)?.discriminator}`);
      }
      txn.create(feedRef.doc(), event);
      const updatedLedgerEvent: Partial<CurationVotesAdded> | Partial<CurationVotesRemoved> = {
        isFeedUpdated: true
      };
      txn.update(ledgerEventRef, updatedLedgerEvent);
    }
  });
}
