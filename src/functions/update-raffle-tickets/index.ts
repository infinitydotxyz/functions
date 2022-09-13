import { RewardsProgramDto } from '@infinityxyz/lib/types/dto/rewards';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
import { getDb } from '../../firestore';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { REGION } from '../../utils/constants';
import { getRelevantStakerContracts } from '../aggregate-sales-stats/utils';
import { getUserPhaseTickets } from './update-raffle-tickets';

export const updateRaffleTickets = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .pubsub.schedule('0 0,12 * * *')
  .onRun(async () => {
    // runs at 12am and 12pm UTC
    console.log('updating raffle tickets');
    const db = getDb();

    const query = db.collection(
      firestoreConstants.REWARDS_COLL
    ) as FirebaseFirestore.CollectionReference<RewardsProgramDto>;
    const rewardSnap = await query.get();

    /**
     * raffleTickets
     *  - {stakerChainId:stakerContractAddress}
     *    - raffleTicketPhases
     *      - {phaseId} { phase, epoch, numTickets, uniqueUsers, updatedAt, chainId, stakerContractAddress, blockNumber }
     *          - raffleTicketPhaseUsers
     *              - {userAddress} {     userAddress: string; numTickets: number; chainId: ChainId; stakerContractAddress: string; blockNumber: number; phase: Phase; epoch: Epoch; volumeUSDC: number; chanceOfWinning: number; rank: number;}
     */

    for (const rewardProgramDoc of rewardSnap.docs) {
      const rewardProgram = rewardProgramDoc.data();
      if (rewardProgram) {
        const stakingContracts = getRelevantStakerContracts(rewardProgram.chainId);
        for (const contract of stakingContracts) {
          for (const epoch of rewardProgram.epochs) {
            for (const phase of epoch.phases) {
              const stakePhaseTicketsSnippetRef = db
                .collection('raffleTickets')
                .doc(`${rewardProgram.chainId}:${contract}`)
                .collection('raffleTicketPhases')
                .doc(phase.name);
              const stakePhaseTicketsSnippetSnap = await stakePhaseTicketsSnippetRef.get();
              const stakePhaseTicketsSnippet = stakePhaseTicketsSnippetSnap.data();
              if (!stakePhaseTicketsSnippet.isFinalized) {
                let result: { tickets: any[]; totalTickets: number; totalUsers: number };
                if (phase.isActive) {
                  result = await getUserPhaseTickets(db, phase.name, rewardProgram.chainId, contract, 'latest');
                } else {
                  result = await getUserPhaseTickets(
                    db,
                    phase.name,
                    rewardProgram.chainId,
                    contract,
                    phase.maxBlockNumber
                  );
                }
                
                const userPhaseTickets = stakePhaseTicketsSnippetRef.collection('raffleTicketPhaseUsers');
                const raffleTicketPhaseDoc = {
                  phase: phase.name,
                  epoch: epoch.name,
                  numTickets: result.totalTickets,
                  uniqueUsers: result.totalUsers,
                  updatedAt: Date.now(),
                  chainId: rewardProgram.chainId,
                  stakerContractAddress: contract,
                  blockNumber: phase.maxBlockNumber,
                  isFinalized: !phase.isActive
                };

                const batch = new FirestoreBatchHandler();
                batch.
              }
            }
          }
        }
      }
    }
  });
