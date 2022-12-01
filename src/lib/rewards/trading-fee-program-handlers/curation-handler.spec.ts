import { RewardEvent } from '@infinityxyz/lib/types/core';
import { TradingFeeDestination } from '@infinityxyz/lib/types/dto';

import { Phase } from '../phases/phase.abstract';
import { TradingFeeRefundBasedPhase } from '../phases/trading-fee-refund-based-phase';
import { getMockPhaseConfig } from '../phases/trading-fee-refund-based-phase.spec';
import { CurationHandler } from './curation-handler';

class MockCurationHandler extends CurationHandler {
  testIsApplicable(event: RewardEvent, phase: Phase): boolean {
    return this._isApplicable(event, phase);
  }
}

describe('CurationHandler', () => {
  it('should return applicable if the phase has curation enabled', () => {
    const phaseConfig = getMockPhaseConfig({ supply: 100, supplyUsed: 0 });
    phaseConfig.split[TradingFeeDestination.Curators] = { percentage: 0.5 };
    const phase = new TradingFeeRefundBasedPhase(phaseConfig);

    const handler = new MockCurationHandler();
    const isApplicable = handler.testIsApplicable({} as any, phase);
    expect(isApplicable).toBe(true);
  });

  it('should return not applicable if the phase does not have curation enabled', () => {
    const phaseConfig = getMockPhaseConfig({ supply: 100, supplyUsed: 0 });
    phaseConfig.split[TradingFeeDestination.Curators] = { percentage: 0 };
    const phase = new TradingFeeRefundBasedPhase(phaseConfig);

    const handler = new MockCurationHandler();
    const isApplicable = handler.testIsApplicable({} as any, phase);
    expect(isApplicable).toBe(false);
  });
});
