import { REWARD_BUFFER } from './constants';
import { RewardProgram } from '@infinityxyz/lib/types/core';
import { RewardPhaseDto } from '@infinityxyz/lib/types/dto/rewards';

export class RewardPhase {
  constructor(protected _rewardPhase: RewardPhaseDto) {}

  get isActive(): boolean {
    const tradingFeeProgram = this._rewardPhase[RewardProgram.TradingFee];
    if (!tradingFeeProgram) {
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
