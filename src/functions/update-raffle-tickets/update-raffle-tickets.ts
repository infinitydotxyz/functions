import {
  ChainId,
  ErroredRaffleTicketPhaseDoc,
  Phase,
  RaffleTicketPhaseDoc,
  TransactionFeePhaseRewardsDoc,
  UserRaffleTickets
} from '@infinityxyz/lib/types/core';
import { firestoreConstants, round } from '@infinityxyz/lib/utils';
import { BigNumber, BigNumberish, ethers } from 'ethers';
import { streamQuery, streamQueryWithRef } from '../../firestore/stream-query';
import { getProvider } from '../../utils/ethersUtils';
import { InfinityStakerABI } from '@infinityxyz/lib/abi/infinityStaker';
import { calculateStats } from '../aggregate-sales-stats/utils';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { RewardPhaseDto } from '@infinityxyz/lib/types/dto/rewards';
import PQueue from 'p-queue';

export async function updateStakerPhaseTickets(
  stakerChainId: ChainId,
  stakerContractAddress: string,
  phase: RewardPhaseDto,
  db: FirebaseFirestore.Firestore
) {
  const stakePhaseTicketsSnippetRef = db
    .collection(firestoreConstants.RAFFLE_TICKETS_COLL)
    .doc(`${stakerChainId}:${stakerContractAddress}`)
    .collection(firestoreConstants.RAFFLE_TICKETS_PHASES_COLL)
    .doc(phase.name) as FirebaseFirestore.DocumentReference<RaffleTicketPhaseDoc>;
  const stakePhaseTicketsSnippetSnap = await stakePhaseTicketsSnippetRef.get();
  const stakePhaseTicketsSnippet = stakePhaseTicketsSnippetSnap.data();
  if (!stakePhaseTicketsSnippet?.isFinalized) {
    let result: {
      tickets: Omit<UserRaffleTickets, 'updatedAt' | 'blockNumber' | 'epoch' | 'isFinalized' | 'tickets'>[];
      totalTickets: number;
      totalUsers: number;
    };
    const isFullyAggregated = await isPhaseFullyAggregated(db, phase.name, stakerChainId);
    if (!isFullyAggregated) {
      throw new Error('Phase is not yet fully aggregated');
    }
    const isFinalizing = !phase.isActive && isFullyAggregated;

    if(!phase.isActive && !isFullyAggregated) {
      console.warn(`Phase ${phase.name} is no longer active but has not yet been fully aggregated`)
    }

    if (!isFinalizing) {
      result = await getUserPhaseTickets(db, phase.name, stakerChainId, stakerContractAddress, 'latest');
    } else {
      if(!isFullyAggregated) {
        throw new Error(`Expected phase to be fully aggregated before attempting to finalize phase tickets`);
      }
      result = await getUserPhaseTickets(db, phase.name, stakerChainId, stakerContractAddress, phase.maxBlockNumber);
    }

    const updatedAt = Date.now();
    const userPhaseTicketsRef = stakePhaseTicketsSnippetRef.collection(
      firestoreConstants.RAFFLE_TICKETS_PHASE_USERS_COLL
    );
    const raffleTicketPhaseDoc: RaffleTicketPhaseDoc = {
      phase: phase.name,
      epoch: phase.epoch,
      numTickets: result.totalTickets,
      uniqueUsers: result.totalUsers,
      updatedAt,
      chainId: stakerChainId,
      stakerContractAddress,
      blockNumber: phase.maxBlockNumber,
      isFinalized: isFinalizing,
      didError: false
    };

    let tickets: UserRaffleTickets[];
    if (isFinalizing) {
      let ticketNumber = BigInt(0);
      tickets = result.tickets.map((item) => {
        const start = ticketNumber;
        const end = ticketNumber + BigInt(item.numTickets) - BigInt(1);
        ticketNumber = end + BigInt(1);
        return {
          ...item,
          updatedAt,
          blockNumber: phase.maxBlockNumber,
          epoch: phase.epoch,
          isFinalized: true,
          tickets: {
            start: start.toString(),
            end: end.toString()
          }
        };
      });
    } else {
      tickets = result.tickets.map((item) => {
        return {
          ...item,
          updatedAt,
          blockNumber: phase.maxBlockNumber,
          epoch: phase.epoch,
          isFinalized: false
        };
      });
    }

    try {
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
    } catch (err) {
      console.error(err);
      const erroredRaffleTicketPhaseDoc: ErroredRaffleTicketPhaseDoc = {
        ...raffleTicketPhaseDoc,
        isFinalized: false,
        didError: true
      };
      await stakePhaseTicketsSnippetRef.set(erroredRaffleTicketPhaseDoc, { merge: false });
    }
  }
}

export async function isPhaseFullyAggregated(db: FirebaseFirestore.Firestore, phase: Phase, chainId: ChainId) {
  const unaggregatedRewards = db
    .collectionGroup(firestoreConstants.USER_TXN_FEE_REWARDS_LEDGER_COLL)
    .where('phase', '==', phase)
    .where('chainId', '==', chainId)
    .where('isAggregated', '==', false);
  const unaggregatedRewardsSnap = await unaggregatedRewards.limit(2).get();
  return unaggregatedRewardsSnap.size === 0;
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
    .where('chainId', '==', chainId) as FirebaseFirestore.Query<TransactionFeePhaseRewardsDoc>;
  const stream = streamQuery(query, (_, ref) => [ref], { pageSize: 300 });

  const usersWithVolume: Omit<UserRaffleTickets, 'updatedAt' | 'blockNumber' | 'epoch' | 'numTickets'>[] = [];

  for await (const userPhaseReward of stream) {
    const userAddress = userPhaseReward.userAddress;
    if (userPhaseReward.volumeUSDC > 0) {
      usersWithVolume.push({
        userAddress,
        chainId,
        stakerContractAddress,
        phase,
        volumeUSDC: userPhaseReward.volumeUSDC,
        chanceOfWinning: Number.NaN,
        rank: Number.NaN,
        isFinalized: false
      });
    }
  }

  const queue = new PQueue({
    concurrency: 25
  });
  let userPhaseTickets: Omit<UserRaffleTickets, 'updatedAt' | 'blockNumber' | 'epoch'>[] = await Promise.all(
    usersWithVolume.map((user) => {
      return queue.add(async () => {
        const stakeLevel = await getUserStakeLevel(user.userAddress, chainId, stakerContractAddress, blockNumber);
        const numTickets = Math.floor(stakeLevel * user.volumeUSDC);
        return {
          ...user,
          numTickets
        };
      });
    })
  );

  userPhaseTickets = userPhaseTickets.filter((user) => user.numTickets > 0);

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
