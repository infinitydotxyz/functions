import { ChainId, Phase, TransactionFeePhaseRewardsDoc } from '@infinityxyz/lib/types/core';
import { firestoreConstants, round } from '@infinityxyz/lib/utils';
import { BigNumber, BigNumberish, ethers } from 'ethers';
import { streamQuery } from '../../firestore/stream-query';
import { getProvider } from '../../utils/ethersUtils';
import { InfinityStakerABI } from '@infinityxyz/lib/abi/infinityStaker';
import { calculateStats } from '../aggregate-sales-stats/utils';

export async function getUserPhaseTickets(
  db: FirebaseFirestore.Firestore,
  phase: Phase,
  chainId: ChainId,
  stakerContractAddress: string,
  blockNumber: number | 'latest'
) {
  const query = db
    .collectionGroup(firestoreConstants.USER_REWARD_PHASES_COLL)
    .where('phase', '==', phase)
    .where('chainId', '==', 'chainId') as FirebaseFirestore.Query<TransactionFeePhaseRewardsDoc>;
  const stream = streamQuery(query, (_, ref) => [ref], { pageSize: 300 });

  let userPhaseTickets: {
    userAddress: string;
    numTickets: number;
    chainId: ChainId;
    stakerContractAddress: string;
    blockNumber: number;
    phase: Phase;
    volumeUSDC: number;
    chanceOfWinning: number;
    rank: number;
  }[] = [];

  for await (const userPhaseReward of stream) {
    const userAddress = userPhaseReward.userAddress;
    const stakeLevel = await getUserStakeLevel(userAddress, chainId, stakerContractAddress, blockNumber);
    const numTickets = stakeLevel * userPhaseReward.volumeUSDC;
    if (numTickets > 0) {
      userPhaseTickets.push({
        userAddress,
        numTickets,
        chainId,
        stakerContractAddress,
        blockNumber,
        phase,
        volumeUSDC: userPhaseReward.volumeUSDC,
        chanceOfWinning: Number.NaN,
        rank: Number.NaN,
      });
    }
  }


  const totalTickets = calculateStats(userPhaseTickets.map(t => t.numTickets)).sum;
  userPhaseTickets = userPhaseTickets.sort((a, b) => b.numTickets - a.numTickets).map((item, index) => {
    return {
        ...item,
        chanceOfWinning: round(item.numTickets / totalTickets * 100, 6),
        rank: index + 1
    }
  });

  return userPhaseTickets;
}

async function getUserStakeLevel(
  user: string,
  chainId: ChainId,
  stakerContractAddress: string,
  blockNumber: number | 'latest' = 'latest'
) {
  const provider = getProvider(chainId);
  const contract = new ethers.Contract(stakerContractAddress, InfinityStakerABI, provider);
  contract.getUserStakeLevel(user);

  const [userStakePower] = (await contract.functions.getUserStakePower(user, {
    blockTag: blockNumber
  })) as [BigNumberish];
  return BigNumber.from(userStakePower).toNumber();
}
