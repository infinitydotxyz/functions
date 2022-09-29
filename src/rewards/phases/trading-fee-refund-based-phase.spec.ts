import { TradingFeeRefundDto } from '@infinityxyz/lib/types/dto';
import { parseEther } from 'ethers/lib/utils';
import { DEFAULT_RAFFLE_CONFIG, TRADING_FEE_SPLIT_PHASE_1_TO_4 } from '../config';
import { REWARD_BUFFER } from '../constants';
import { TokenomicsPhaseWithTradingFeeRefund, TradingFeeRefundBasedPhase } from './trading-fee-refund-based-phase';

const ETH_PRICE = 1600;
const getFeesGenerated = (ethAmount: number) => ({
  feesGeneratedWei: parseEther(ethAmount.toString()).toString(),
  feesGeneratedEth: ethAmount,
  feesGeneratedUSDC: ethAmount * ETH_PRICE
});

export const getMockPhaseConfig = ({
  supply,
  supplyUsed,
  rewardRateNumerator
}: {
  supply: number;
  supplyUsed: number;
  rewardRateNumerator?: number;
}): TokenomicsPhaseWithTradingFeeRefund => {
  const tradingFeeRefund: TradingFeeRefundDto = {
    maxReward: Number.POSITIVE_INFINITY,
    rewardRateNumerator: typeof rewardRateNumerator === 'number' ? rewardRateNumerator : 10,
    rewardRateDenominator: 1,
    rewardSupply: supply,
    rewardSupplyUsed: supplyUsed,
    buyerPortion: 0.7,
    sellerPortion: 0.3
  };
  return {
    name: 'Phase 1',
    id: '1',
    index: 0,
    isActive: false,
    split: TRADING_FEE_SPLIT_PHASE_1_TO_4,
    lastBlockIncluded: 0,
    progress: 0,
    feesGenerated: getFeesGenerated(0),
    curationFeesGenerated: getFeesGenerated(0),
    raffleFeesGenerated: getFeesGenerated(0),
    collectionPotFeesGenerated: getFeesGenerated(0),
    treasuryFeesGenerated: getFeesGenerated(0),
    tradingFeeRefund: tradingFeeRefund,
    raffleConfig: {
      phasePrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG },
      grandPrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG }
    }
  };
};

describe('TradingFeeRefundBasedPhase', () => {
  it('should be active if the reward supply used is less than the reward supply', () => {
    const config = getMockPhaseConfig({ supply: 100 + REWARD_BUFFER, supplyUsed: 50 });
    const phase = new TradingFeeRefundBasedPhase(config);

    expect(phase.isActive).toBe(true);
  });

  it('should be inactive if the reward supply used is equal to the reward supply', () => {
    const config = getMockPhaseConfig({ supply: 100, supplyUsed: 100 });
    const phase = new TradingFeeRefundBasedPhase(config);

    expect(phase.isActive).toBe(false);
  });

  it('should be inactive if the reward supply use is greater than the reward supply', () => {
    const config = getMockPhaseConfig({ supply: 100, supplyUsed: 150 });
    const phase = new TradingFeeRefundBasedPhase(config);

    expect(phase.isActive).toBe(false);
  });
});
