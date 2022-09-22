import { RewardsProgramDto } from '@infinityxyz/lib/types/dto/rewards';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
import { getDb } from '../../firestore';
import { REGION } from '../../utils/constants';
import { getRelevantStakerContracts } from '../aggregate-sales-stats/utils';
import { updateStakerPhaseTickets } from './update-raffle-tickets';

export const updateRaffleTickets = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .pubsub.schedule('0 * * * *') // at the start of every hour
  .onRun(async () => {
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
     *              - {userAddress} { userAddress: string; numTickets: number; chainId: ChainId; stakerContractAddress: string; blockNumber: number; phase: Phase; epoch: Epoch; volumeUSDC: number; chanceOfWinning: number; rank: number;}
     */

    for (const rewardProgramDoc of rewardSnap.docs) {
      const rewardProgram = rewardProgramDoc.data();
      if (rewardProgram) {
        const stakingContracts = getRelevantStakerContracts(rewardProgram.chainId);
        for (const contract of stakingContracts) {
          for (const epoch of rewardProgram.epochs) {
            for (const phase of epoch.phases) {
              await updateStakerPhaseTickets(rewardProgram.chainId, contract, phase, db);
            }
          }
        }
      }
    }
  });