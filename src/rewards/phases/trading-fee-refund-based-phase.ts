import { TokenomicsPhase, TradingFeeRefund } from '../../tokenomics/types';
import { REWARD_BUFFER } from '../constants';
import { Phase } from './phase.abstract';

export type TokenomicsPhaseWithTradingFeeRefund = Omit<TokenomicsPhase, 'tradingFeeRefund'> & {
  tradingFeeRefund: TradingFeeRefund;
};

export class TradingFeeRefundBasedPhase extends Phase {
  protected _phase: TokenomicsPhaseWithTradingFeeRefund;
  constructor(phase: TokenomicsPhaseWithTradingFeeRefund) {
    super(phase);
    if (!this._phase.tradingFeeRefund) {
      throw new Error('TradingFeeRefundBasedPhase requires a tradingFeeRefund');
    }
  }

  /**
   *
   */
  get isActive(): boolean {
    return this._phase.tradingFeeRefund.rewardSupplyUsed + REWARD_BUFFER < this._phase.tradingFeeRefund.rewardSupply;
  }
}
