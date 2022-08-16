import { RageQuitEvent, StakerEvents, StakerEventType, TokensStakedEvent, TokensUnStakedEvent } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { removeUserCollectionVotes } from './remove-collection-votes';
import { UserProfileDto, UserStakeDto } from '@infinityxyz/lib/types/dto/user';
import { EventType, UserRageQuitEvent, UserStakedEvent, UserUnStakedEvent } from '@infinityxyz/lib/types/core/feed';

export async function handleStakerEvent(
  event: StakerEvents,
  eventRef: FirebaseFirestore.DocumentReference<StakerEvents>
): Promise<void> {
  const user = event.user;
  await updateUserStake(event, eventRef);
  const votingPowerReduced =
    event.discriminator === StakerEventType.RageQuit || event.discriminator === StakerEventType.UnStaked;
  if (votingPowerReduced) {
    await removeUserCollectionVotes(user, eventRef.firestore, event);
  }

  const eventRefUpdate: Partial<StakerEvents> = {
    processed: true
  };
  await eventRef.set(eventRefUpdate, { merge: true });
}

async function updateUserStake(event: StakerEvents, eventRef: FirebaseFirestore.DocumentReference<StakerEvents>) {
  const user = event.user;
  const userRef = eventRef.firestore.collection(firestoreConstants.USERS_COLL).doc(user) as FirebaseFirestore.DocumentReference<UserProfileDto>;
  await eventRef.firestore.runTransaction(async (txn) => {
    const userStakeRef = userRef
      .collection(firestoreConstants.USER_CURATION_COLL)
      .doc(
        `${event.stakerContractChainId}:${event.stakerContractAddress}`
      ) as FirebaseFirestore.DocumentReference<UserStakeDto>;

    const [userStakeSnap, userProfileSnap] = await txn.getAll<any>(userStakeRef, userRef) as [FirebaseFirestore.DocumentSnapshot<UserStakeDto>, FirebaseFirestore.DocumentSnapshot<UserProfileDto>];
    let userStake: Partial<UserStakeDto> = userStakeSnap.data() ?? {};
    const userProfile: Partial<UserProfileDto> = userProfileSnap.data() ?? {};

    const userStakeDocExists = !!userStake?.blockUpdatedAt;
    const userStakeRequiresUpdate =
      !userStakeDocExists || (userStake.blockUpdatedAt && userStake.blockUpdatedAt < event.blockNumber);

    if (userStakeRequiresUpdate) {
      const update: Omit<UserStakeDto, 'totalCurated' | 'totalCuratedVotes'> = {
        stakerContractAddress: event.stakerContractAddress,
        stakerContractChainId: event.stakerContractChainId,
        stakeInfo: event.stakeInfo,
        stakePower: event.stakePower,
        blockUpdatedAt: event.blockNumber
      };
      userStake = { ...userStake, ...update };

      
      txn.set(userStakeRef, update, { merge: true });
    }
    const feedEvent = stakerEventToFeedEventAdapter(event, userProfile);
    const feedRef = eventRef.firestore.collection(firestoreConstants.FEED_COLL).doc();
    txn.create(feedRef, feedEvent);
  });
}

export function stakerEventToFeedEventAdapter<T extends StakerEvents>(stakerEvent: T, user: Partial<UserProfileDto>) {
    switch(stakerEvent.discriminator) {
      case StakerEventType.Staked: 
        return stakeEventToStakeFeedEvent(stakerEvent, user);
      case StakerEventType.UnStaked:
        return unStakeEventToUnStakeFeedEvent(stakerEvent, user);
      case StakerEventType.RageQuit:
        return rageQuitEventToRageQuitFeedEvent(stakerEvent, user);
    }
}

function stakeEventToStakeFeedEvent(stakeEvent: TokensStakedEvent, user: Partial<UserProfileDto>): UserStakedEvent {
    const feedEvent: UserStakedEvent = { 
      type: EventType.TokensStaked,
      duration: stakeEvent.duration,
      stakeInfo: stakeEvent.stakeInfo,
      stakePower: stakeEvent.stakePower,
      amount: stakeEvent.amount,
      timestamp: stakeEvent.timestamp,
      blockNumber: stakeEvent.blockNumber,
      txHash: stakeEvent.txHash,
      stakerContractChainId: stakeEvent.stakerContractChainId,
      stakerContractAddress: stakeEvent.stakerContractAddress,
      userUsername: user.username ?? '',
      userAddress: stakeEvent.user,
      userDisplayName: '',
      userProfileImage: '',
      likes: 0,
      comments: 0,
      usersInvolved: [stakeEvent.user],
    };

    return feedEvent;
} 

function unStakeEventToUnStakeFeedEvent(unStakeEvent: TokensUnStakedEvent, user: Partial<UserProfileDto>): UserUnStakedEvent {
  const feedEvent: UserUnStakedEvent = { 
    type: EventType.TokensUnStaked,
    stakeInfo: unStakeEvent.stakeInfo,
    stakePower: unStakeEvent.stakePower,
    amount: unStakeEvent.amount,
    timestamp: unStakeEvent.timestamp,
    blockNumber: unStakeEvent.blockNumber,
    txHash: unStakeEvent.txHash,
    stakerContractChainId: unStakeEvent.stakerContractChainId,
    stakerContractAddress: unStakeEvent.stakerContractAddress,
    userAddress: unStakeEvent.user,
    userUsername: user.username ?? '',
    userDisplayName: '',
    userProfileImage: '',
    likes: 0,
    comments: 0,
    usersInvolved: [unStakeEvent.user],
  };

  return feedEvent;
}

function rageQuitEventToRageQuitFeedEvent(rageQuitEvent: RageQuitEvent, user: Partial<UserProfileDto>): UserRageQuitEvent {
  const feedEvent: UserRageQuitEvent = { 
    type: EventType.TokensRageQuit,
    stakeInfo: rageQuitEvent.stakeInfo,
    stakePower: rageQuitEvent.stakePower,
    amount: rageQuitEvent.amount,
    timestamp: rageQuitEvent.timestamp,
    blockNumber: rageQuitEvent.blockNumber,
    txHash: rageQuitEvent.txHash,
    stakerContractChainId: rageQuitEvent.stakerContractChainId,
    stakerContractAddress: rageQuitEvent.stakerContractAddress,
    userUsername: user.username ?? '',
    userAddress: rageQuitEvent.user,
    userDisplayName: user.displayName || '',
    userProfileImage: user.profileImage || '',
    likes: 0,
    comments: 0,
    usersInvolved: [rageQuitEvent.user],
    penaltyAmount: rageQuitEvent.penaltyAmount,
  };

  return feedEvent;
}