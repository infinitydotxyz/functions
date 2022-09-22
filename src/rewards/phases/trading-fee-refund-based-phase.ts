import { REWARD_BUFFER } from '../constants';
import { Phase } from './phase.abstract';

export class TradingFeeRefundBasedPhase extends Phase {
  get isActive(): boolean {
    if (!this._phase.tradingFeeRefund) {
      return true;
    }
    
    return this._phase.tradingFeeRefund.rewardSupplyUsed + REWARD_BUFFER < this._phase.tradingFeeRefund.rewardSupply;
  }
}
