import { streamQuery } from '../firestore/stream-query';
import {
  CurationBlockRewardsDoc,
  CurationMetadata,
  CurationPeriodDoc,
  CurationPeriodUser,
  CurationUser,
  CurrentCurationSnippetDoc
} from './types';

export async function updateCurrentCurationSnippet(
  curationMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>,
  collectionAddress: string,
  chainId: string
) {
  const blockRewards = curationMetadataRef.collection(
    'curationBlockRewards'
  ) as FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc>;
  const periodRewards = curationMetadataRef.collection(
    'curationPeriodRewards'
  ) as FirebaseFirestore.CollectionReference<CurationPeriodDoc>;

  const mostRecentBlocksQuery = blockRewards.orderBy('timestamp', 'desc').limit(2);
  const mostRecentPeriodQuery = periodRewards.orderBy('timestamp', 'desc').limit(2);

  const mostRecentBlocksSnapshot = await mostRecentBlocksQuery.get();
  const mostRecentPeriodsSnapshot = await mostRecentPeriodQuery.get();

  const mostRecentBlocks = await Promise.all(
    mostRecentBlocksSnapshot.docs.map(async (doc) => {
      const docData = doc.data();

      const blockUsersRef = doc.ref.collection(
        'curationBlockUserRewards'
      ) as FirebaseFirestore.CollectionReference<CurationUser>;
      const blockUsers = await loadUsers(blockUsersRef);
      return {
        ...docData,
        users: blockUsers
      };
    })
  );

  const mostRecentPeriods = await Promise.all(
    mostRecentPeriodsSnapshot.docs.map(async (doc) => {
      const docData = doc.data();

      const periodUsersRef = doc.ref.collection(
        'curationPeriodUserRewards'
      ) as FirebaseFirestore.CollectionReference<CurationPeriodUser>;
      const periodUsers = await loadUsers(periodUsersRef);
      return {
        ...docData,
        users: periodUsers
      };
    })
  );

  const [currentBlock, prevBlock] = mostRecentBlocks;
  const [currentPeriod, prevPeriod] = mostRecentPeriods;

  const sortUsersByVotes = <User extends { votes: number }>(users: Record<string, User>) => {
    return Object.values(users ?? {}).sort((userA, userB) => {
      return userB.votes - userA.votes;
    });
  };

  const currentBlockTopUsers = sortUsersByVotes(currentBlock?.users ?? {});
  const prevBlockTopUsers = sortUsersByVotes(prevBlock?.users ?? {});
  const currentPeriodTopUsers = sortUsersByVotes(currentPeriod?.users ?? {});
  const prevPeriodTopUsers = sortUsersByVotes(prevPeriod?.users ?? {});

  const numTopUsers = 10;
  const currentCurationSnippet: CurrentCurationSnippetDoc = {
    currentPeriod,
    currentBlock,
    prevPeriod,
    prevBlock,
    prevPeriodTopUsers: prevPeriodTopUsers.slice(0, numTopUsers),
    currentPeriodTopUsers: currentPeriodTopUsers.slice(0, numTopUsers),
    prevBlockTopUsers: prevBlockTopUsers.slice(0, numTopUsers),
    currentBlockTopUsers: currentBlockTopUsers.slice(0, numTopUsers),
  };
}

async function loadUsers<User extends { userAddress: string }>(
  userRef: FirebaseFirestore.CollectionReference<User>
): Promise<{ [userAddress: string]: User }> {
  const userStream = streamQuery(userRef, (item, ref) => [ref], { pageSize: 300 });

  const users: Record<string, User> = {};
  for await (const user of userStream) {
    if (user?.userAddress) {
      users[user.userAddress] = user;
    }
  }

  return users;
}
