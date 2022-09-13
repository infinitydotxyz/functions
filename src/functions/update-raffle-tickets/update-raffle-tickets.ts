import { ChainId, Phase, TransactionFeePhaseRewardsDoc } from '@infinityxyz/lib/types/core';
import { firestoreConstants, round } from '@infinityxyz/lib/utils';
import { BigNumber, BigNumberish, ethers } from 'ethers';
import { streamQuery, streamQueryWithRef } from '../../firestore/stream-query';
import { getProvider } from '../../utils/ethersUtils';
import { InfinityStakerABI } from '@infinityxyz/lib/abi/infinityStaker';
import { calculateStats } from '../aggregate-sales-stats/utils';
import { RaffleTicketPhaseDoc, UserRaffleTickets } from './types';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { RewardPhaseDto } from '@infinityxyz/lib/types/dto/rewards';

export async function updateStakerPhaseTickets(
  stakerChainId: ChainId,
  stakerContractAddress: string,
  phase: RewardPhaseDto,
  db: FirebaseFirestore.Firestore
) {
  const stakePhaseTicketsSnippetRef = db
    .collection('raffleTickets')
    .doc(`${stakerChainId}:${stakerContractAddress}`)
    .collection('raffleTicketPhases')
    .doc(phase.name) as FirebaseFirestore.DocumentReference<RaffleTicketPhaseDoc>;
  const stakePhaseTicketsSnippetSnap = await stakePhaseTicketsSnippetRef.get();
  const stakePhaseTicketsSnippet = stakePhaseTicketsSnippetSnap.data();
  if (!stakePhaseTicketsSnippet?.isFinalized) {
    let result: {
      tickets: Omit<UserRaffleTickets, 'updatedAt' | 'blockNumber' | 'epoch'>[];
      totalTickets: number;
      totalUsers: number;
    };
    if (phase.isActive) {
      result = await getUserPhaseTickets(db, phase.name, stakerChainId, stakerContractAddress, 'latest');
    } else {
      result = await getUserPhaseTickets(db, phase.name, stakerChainId, stakerContractAddress, phase.maxBlockNumber);
    }

    const updatedAt = Date.now();
    const userPhaseTicketsRef = stakePhaseTicketsSnippetRef.collection('raffleTicketPhaseUsers');
    const raffleTicketPhaseDoc: RaffleTicketPhaseDoc = {
      phase: phase.name,
      epoch: phase.epoch,
      numTickets: result.totalTickets,
      uniqueUsers: result.totalUsers,
      updatedAt,
      chainId: stakerChainId,
      stakerContractAddress,
      blockNumber: phase.maxBlockNumber,
      isFinalized: !phase.isActive
    };

    const tickets: UserRaffleTickets[] = result.tickets.map((item) => {
      return {
        ...item,
        updatedAt,
        blockNumber: phase.maxBlockNumber,
        epoch: phase.epoch
      };
    });

    // update raffle tickets
    const batch = new FirestoreBatchHandler();
    for (const ticket of tickets) {
      await batch.addAsync(userPhaseTicketsRef.doc(ticket.userAddress), ticket, { merge: false });
    }
    await batch.addAsync(stakePhaseTicketsSnippetRef, raffleTicketPhaseDoc, { merge: false });
    await batch.flush();

    // delete any raffle tickets that are no longer valid
    const ticketsToDelete = userPhaseTicketsRef.where('updatedAt', '<', updatedAt);
    const ticketsToDeleteStream = streamQueryWithRef(ticketsToDelete, (_, ref) => [ref], { pageSize: 300 });
    for await (const { ref } of ticketsToDeleteStream) {
      await batch.deleteAsync(ref);
    }
    await batch.flush();
  }
}

export async function getUserPhaseTickets(
  db: FirebaseFirestore.Firestore,
  phase: Phase,
  chainId: ChainId,
  stakerContractAddress: string,
  blockNumber: number | 'latest'
): Promise<{
  tickets: Omit<UserRaffleTickets, 'updatedAt' | 'blockNumber' | 'epoch'>[];
  totalTickets: number;
  totalUsers: number;
}> {
  const query = db
    .collectionGroup(firestoreConstants.USER_REWARD_PHASES_COLL)
    .where('phase', '==', phase)
    .where('chainId', '==', 'chainId') as FirebaseFirestore.Query<TransactionFeePhaseRewardsDoc>;
  const stream = streamQuery(query, (_, ref) => [ref], { pageSize: 300 });

  let userPhaseTickets: Omit<UserRaffleTickets, 'updatedAt' | 'blockNumber' | 'epoch'>[] = [];

  for await (const userPhaseReward of stream) {
    const userAddress = userPhaseReward.userAddress;
    const stakeLevel = await getUserStakeLevel(userAddress, chainId, stakerContractAddress, blockNumber);
    console.log(`User: ${userPhaseReward.userAddress} Stake Level: ${stakeLevel}`);

    const numTickets = stakeLevel * userPhaseReward.volumeUSDC;
    if (numTickets > 0) {
      userPhaseTickets.push({
        userAddress,
        numTickets,
        chainId,
        stakerContractAddress,
        phase,
        volumeUSDC: userPhaseReward.volumeUSDC,
        chanceOfWinning: Number.NaN,
        rank: Number.NaN
      });
    }
  }

  const totalTickets = calculateStats(userPhaseTickets.map((t) => t.numTickets)).sum;
  userPhaseTickets = userPhaseTickets
    .sort((a, b) => b.numTickets - a.numTickets)
    .map((item, index) => {
      return {
        ...item,
        chanceOfWinning: round((item.numTickets / totalTickets) * 100, 6),
        rank: index + 1
      };
    });

  return { tickets: userPhaseTickets, totalTickets, totalUsers: userPhaseTickets.length };
}

async function getUserStakeLevel(
  user: string,
  chainId: ChainId,
  stakerContractAddress: string,
  blockNumber: number | 'latest' = 'latest'
) {
  const provider = getProvider(chainId);
  const contract = new ethers.Contract(stakerContractAddress, InfinityStakerABI, provider);
  const [userStakeLevel] = (await contract.functions.getUserStakeLevel(user, {
    blockTag: blockNumber
  })) as [BigNumberish];
  return BigNumber.from(userStakeLevel).toNumber();
}
