import { parseEther } from 'ethers/lib/utils';

import { TokenomicsPhaseDto, TradingFeeRefundDto } from '@infinityxyz/lib/types/dto';

import { DEFAULT_RAFFLE_CONFIG, TRADING_FEE_SPLIT_PHASE_1_TO_4 } from '../config';
import { ContinuousPhase } from './continuous-phase';
import { PhaseFactory } from './phase.factory';
import { TradingFeeRefundBasedPhase } from './trading-fee-refund-based-phase';

const ETH_PRICE = 1600;
const getFeesGenerated = (ethAmount: number) => ({
  feesGeneratedWei: parseEther(ethAmount.toString()).toString(),
  feesGeneratedEth: ethAmount,
  feesGeneratedUSDC: ethAmount * ETH_PRICE
});

const getDefaultPhase = (hasTradingFeeRefund: boolean): TokenomicsPhaseDto => {
  const tradingFeeRefund: TradingFeeRefundDto = {
    maxReward: Number.POSITIVE_INFINITY,
    rewardRateNumerator: 10,
    rewardRateDenominator: 1,
    rewardSupply: 200_000_000,
    rewardSupplyUsed: 0,
    buyerPortion: 0.7,
    sellerPortion: 0.3
  };
  return {
    name: 'Phase 1',
    id: '1',
    index: 0,
    isActive: true,
    split: TRADING_FEE_SPLIT_PHASE_1_TO_4,
    lastBlockIncluded: 0,
    progress: 0,
    feesGenerated: getFeesGenerated(0),
    curationFeesGenerated: getFeesGenerated(0),
    raffleFeesGenerated: getFeesGenerated(0),
    collectionPotFeesGenerated: getFeesGenerated(0),
    treasuryFeesGenerated: getFeesGenerated(0),
    tradingFeeRefund: hasTradingFeeRefund ? tradingFeeRefund : null,
    raffleConfig: {
      phasePrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG },
      grandPrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG }
    }
  };
};

describe('Phase Factory', () => {
  it('should create a Trading Fee Refund based phase if the phase specifies a trading fee refund', () => {
    const res = PhaseFactory.create(getDefaultPhase(true));
    expect(res instanceof TradingFeeRefundBasedPhase).toBe(true);
  });

  it("should create a Continuous phase if the phase doesn't specify a trading fee refund", () => {
    const res = PhaseFactory.create(getDefaultPhase(false));
    expect(res instanceof TradingFeeRefundBasedPhase).toBe(false);
    expect(res instanceof ContinuousPhase).toBe(true);
  });
});
