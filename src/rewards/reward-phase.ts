import { REWARD_BUFFER } from './constants';
import { RewardProgram } from '@infinityxyz/lib/types/core';
import { TokenomicsPhase } from '../tokenomics/types';

export class RewardPhase {
  constructor(protected _rewardPhase: TokenomicsPhase) {}

  get isActive(): boolean {
    if(!this._rewardPhase.tradingFeeRefund) {
      /**
       * set so that the final phase continues forever 
       * so that curation continues to be rewarded
       */ 
      return true;
    }

    return tradingFeeProgram.rewardSupplyUsed + REWARD_BUFFER < tradingFeeProgram.rewardSupply;
  }

  get maxBlockNumber(): number {
    return this._rewardPhase.maxBlockNumber;
  }

  set maxBlockNumber(blockNumber: number) {
    this._rewardPhase.maxBlockNumber = blockNumber;
  }

  toJSON(): RewardPhaseDto {
    return {
      ...this._rewardPhase,
      isActive: this.isActive
    };
  }

  getRewardProgram(program: RewardProgram): RewardPhaseDto[RewardProgram] {
    return this._rewardPhase[program];
  }
}
