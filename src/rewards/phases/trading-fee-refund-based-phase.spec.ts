import { REWARD_BUFFER } from '../constants';
import { TradingFeeRefundBasedPhase } from './trading-fee-refund-based-phase';

describe('TradingFeeRefundBasedPhase', () => {
  it('should be active if the reward supply used is less than the reward supply', () => {
    const phase = new TradingFeeRefundBasedPhase({
      tradingFeeRefund: {
        rewardSupply: 100 + REWARD_BUFFER,
        rewardSupplyUsed: 50
      }
    } as any);

    expect(phase.isActive).toBe(true);
  });

  it('should be inactive if the reward supply used is equal to the reward supply', () => {
    const phase = new TradingFeeRefundBasedPhase({
      tradingFeeRefund: {
        rewardSupply: 100,
        rewardSupplyUsed: 100
      }
    } as any);

    expect(phase.isActive).toBe(false);
  });

  it('should be inactive if the reward supply use is greater than the reward supply', () => {
    const phase = new TradingFeeRefundBasedPhase({
      tradingFeeRefund: {
        rewardSupply: 100,
        rewardSupplyUsed: 150
      }
    } as any);

    expect(phase.isActive).toBe(false);
  });
});
