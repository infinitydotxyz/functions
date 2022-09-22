import { TokenomicsPhase } from '../../tokenomics/types';
import { ContinuousPhase } from './continuous-phase';
import { Phase } from './phase.abstract';
import { TokenomicsPhaseWithTradingFeeRefund, TradingFeeRefundBasedPhase } from './trading-fee-refund-based-phase';

export class PhaseFactory {
  public static create(phase: TokenomicsPhase): Phase {
    if (phase.tradingFeeRefund) {
      return new TradingFeeRefundBasedPhase(phase as TokenomicsPhaseWithTradingFeeRefund);
    }

    return new ContinuousPhase(phase);
  }
}
