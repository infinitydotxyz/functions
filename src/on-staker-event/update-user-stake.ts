import { StakeInfo, StakerEvents } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { UserProfileDto as IUserProfileDto } from '@infinityxyz/lib/types/dto/user/user-profile.dto';
type UserStake = {
  stakeInfo: StakeInfo;
  stakePower: number;
  blockUpdatedAt: number;
};
type UserProfileDto = IUserProfileDto & {
  stake: UserStake;
};

export async function updateUserStake(
  user: string,
  event: StakerEvents,
  db: FirebaseFirestore.Firestore
): Promise<{ userStake: UserStake; totalCuratedVotes: number }> {
  const userRef = db.collection(firestoreConstants.USERS_COLL).doc(user);

  const userStakeAndVotes = await db.runTransaction<{ userStake: UserStake; totalCuratedVotes: number }>(
    async (txn) => {
      const userDoc = await txn.get(userRef);
      const userData = userDoc.data() as UserProfileDto | undefined;
      const userStake = {
        stakeInfo: event.stakeInfo,
        stakePower: event.stakePower,
        blockUpdatedAt: event.blockNumber
      };
      if (!userData?.stake?.blockUpdatedAt || userData?.stake?.blockUpdatedAt < event.blockNumber) {
        const userUpdate: Partial<UserProfileDto> = {
          stake: userStake
        };
        txn.set(userRef, userUpdate, { merge: true });
      } else {
        console.log(`User ${user} stake already up to date`);
      }

      return {
        userStake,
        totalCuratedVotes: userData?.totalCuratedVotes ?? 0
      };
    }
  );

  return userStakeAndVotes;
}
