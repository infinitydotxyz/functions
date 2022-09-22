import { TokenomicsPhase, TradingFeeRefund } from '../../tokenomics/types';
import { REWARD_BUFFER } from '../constants';
import { Phase, ProgressAuthority } from './phase.abstract';

export type TokenomicsPhaseWithTradingFeeRefund = Omit<TokenomicsPhase, 'tradingFeeRefund'> & {
  tradingFeeRefund: TradingFeeRefund;
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
