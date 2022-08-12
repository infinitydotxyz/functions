import { StakerEvents, StakerEventType } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { removeUserCollectionVotes } from './remove-collection-votes';
import { UserStakeDto } from '@infinityxyz/lib/types/dto/user';

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
  const userRef = eventRef.firestore.collection(firestoreConstants.USERS_COLL).doc(user);
  await eventRef.firestore.runTransaction(async (txn) => {
    const userStakeRef = userRef
      .collection(firestoreConstants.USER_CURATION_COLL)
      .doc(
        `${event.stakerContractChainId}:${event.stakerContractAddress}`
      ) as FirebaseFirestore.DocumentReference<UserStakeDto>;

    const userStakeSnap = await txn.get(userStakeRef);
    let userStake: Partial<UserStakeDto> = userStakeSnap.data() ?? {};

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
  });
}
