import { TokenomicsPhaseDto, TradingFeeRefundDto } from '@infinityxyz/lib/types/dto';

import { REWARD_BUFFER } from '../constants';
import { Phase, ProgressAuthority } from './phase.abstract';

export type TokenomicsPhaseWithTradingFeeRefund = Omit<TokenomicsPhaseDto, 'tradingFeeRefund'> & {
  tradingFeeRefund: TradingFeeRefundDto;
};

export class TradingFeeRefundBasedPhase extends Phase {
  readonly authority = ProgressAuthority.TradingFees;

  protected _phase: TokenomicsPhaseWithTradingFeeRefund;
  constructor(phase: TokenomicsPhaseWithTradingFeeRefund) {
    super(phase);
    if (!this._phase.tradingFeeRefund) {
      throw new Error('TradingFeeRefundBasedPhase requires a tradingFeeRefund');
    }
  }

  /**
   * this phase continues until the reward supply is used up
   */
  get isActive(): boolean {
    return this._phase.tradingFeeRefund.rewardSupplyUsed + REWARD_BUFFER < this._phase.tradingFeeRefund.rewardSupply;
  }
}
