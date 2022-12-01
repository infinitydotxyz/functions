import { TokenomicsPhaseDto } from '@infinityxyz/lib/types/dto';

import { ContinuousPhase } from './continuous-phase';
import { Phase } from './phase.abstract';
import { TokenomicsPhaseWithTradingFeeRefund, TradingFeeRefundBasedPhase } from './trading-fee-refund-based-phase';

export class PhaseFactory {
  public static create(phase: TokenomicsPhaseDto): Phase {
    if (phase.tradingFeeRefund) {
      return new TradingFeeRefundBasedPhase(phase as TokenomicsPhaseWithTradingFeeRefund);
    }

    return new ContinuousPhase(phase);
  }
}
