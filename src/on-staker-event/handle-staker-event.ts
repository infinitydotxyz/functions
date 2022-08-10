import { StakeInfo, StakerEvents, StakerEventType } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { UserProfileDto as IUserProfileDto } from '@infinityxyz/lib/types/dto/user/user-profile.dto';
import { removeUserCollectionVotes } from './remove-collection-votes';

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
  eventRef: FirebaseFirestore.DocumentReference<StakerEvents>
): Promise<{ userStake: UserStake; totalCuratedVotes: number }> {
  const user = event.user;
  const userRef = eventRef.firestore.collection(firestoreConstants.USERS_COLL).doc(user);
  const userStakeAndVotes = await eventRef.firestore.runTransaction<{
    userStake: UserStake;
    totalCuratedVotes: number;
  }>(async (txn) => {
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

    const userUpdate: Partial<UserProfileDto> = {
      stake: userStake
    };
    txn.set(userRef, userUpdate, { merge: true });

    return {
      userStake,
      totalCuratedVotes: userData?.totalCuratedVotes ?? 0,
      totalCurated: userData?.totalCurated ?? 0
    };
  });

  const votingPowerReduced =
    event.discriminator === StakerEventType.RageQuit || event.discriminator === StakerEventType.UnStaked;
  if (votingPowerReduced) {
    await removeUserCollectionVotes(user, eventRef.firestore, event);
  }

  const eventRefUpdate: Partial<StakerEvents> = {
    processed: true
  };
  await eventRef.set(eventRefUpdate, { merge: true });

  return userStakeAndVotes;
}
