import {
  CurationVotesAdded,
  CurationVotesRemoved,
  InfinityNftSale
} from '@infinityxyz/lib/types/core';
import { RewardPhase } from '../reward-phase';
import { RewardProgramEventHandlerResponse, RewardProgramHandler } from './reward-program-handler.abstract';

export class CurationHandler extends RewardProgramHandler {

  onSale(sale: InfinityNftSale, phase: RewardPhase): RewardProgramEventHandlerResponse {
    throw new Error('Method not implemented.');
  }

  onVotesAdded(vote: CurationVotesAdded, phase: RewardPhase): RewardProgramEventHandlerResponse {
    throw new Error('Method not implemented.');
  }

  onVotesRemoved(votes: CurationVotesRemoved, phase: RewardPhase): RewardProgramEventHandlerResponse {
    throw new Error('Method not implemented.');
  }
}
