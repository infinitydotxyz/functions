import { InfinityNftSale, CurationVotesAdded, CurationVotesRemoved } from '@infinityxyz/lib/types/core';
import { RewardPhase } from '../reward-phase';
import { RewardProgramEventHandlerResponse, RewardProgramHandler } from './reward-program-handler.abstract';

// handled by the transaction fee handler
export class NftHandler extends RewardProgramHandler {
  onSale(sale: InfinityNftSale, phase: RewardPhase): RewardProgramEventHandlerResponse {
    return {
        applicable: false,
        phase,
        saveEvent: () => {
          return;
        },
        split: undefined
      };
  }

  onVotesAdded(vote: CurationVotesAdded, phase: RewardPhase): RewardProgramEventHandlerResponse {
    return {
      applicable: false,
      phase,
      saveEvent: () => {
        return;
      },
      split: undefined
    };
  }

  onVotesRemoved(votes: CurationVotesRemoved, phase: RewardPhase): RewardProgramEventHandlerResponse {
    return {
      applicable: false,
      phase,
      saveEvent: () => {
        return;
      },
      split: undefined
    };
  }
}
