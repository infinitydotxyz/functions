import { TokenomicsPhaseDto, TradingFeeDestination, TradingFeeSplit } from '@infinityxyz/lib/types/dto';

export const TRADING_FEE_SPLIT_PHASE_1_TO_4: TradingFeeSplit = {
  [TradingFeeDestination.Curators]: { percentage: 30 },
  [TradingFeeDestination.Raffle]: { percentage: 30 },
  [TradingFeeDestination.CollectionPot]: { percentage: 20 },
  [TradingFeeDestination.Treasury]: { percentage: 20 }
};

export const TRADING_FEE_SPLIT_PHASE_5: TradingFeeSplit = {
  // TODO what should this be?
  [TradingFeeDestination.Curators]: { percentage: 80 },
  [TradingFeeDestination.Raffle]: { percentage: 0 },
  [TradingFeeDestination.CollectionPot]: { percentage: 0 },
  [TradingFeeDestination.Treasury]: { percentage: 20 }
};

const BUYER_PORTION = 0.7;
const SELLER_PORTION = 0.3;

const getDefaultFeesGenerated = () => ({
  feesGeneratedWei: '0',
  feesGeneratedEth: 0,
  feesGeneratedUSDC: 0
});

export const PhaseOne: Omit<TokenomicsPhaseDto, 'index'> = {
  name: 'Phase 1',
  id: '1',
  isActive: true,
  split: TRADING_FEE_SPLIT_PHASE_1_TO_4,
  lastBlockIncluded: 0,
  progress: 0,
  feesGenerated: getDefaultFeesGenerated(),
  curationFeesGenerated: getDefaultFeesGenerated(),
  raffleFeesGenerated: getDefaultFeesGenerated(),
  collectionPotFeesGenerated: getDefaultFeesGenerated(),
  treasuryFeesGenerated: getDefaultFeesGenerated(),
  tradingFeeRefund: {
    maxReward: Number.POSITIVE_INFINITY,
    rewardRateNumerator: 10,
    rewardRateDenominator: 1,
    rewardSupply: 200_000_000,
    rewardSupplyUsed: 0,
    buyerPortion: BUYER_PORTION,
    sellerPortion: SELLER_PORTION
  }
};

export const PhaseTwo: Omit<TokenomicsPhaseDto, 'index'> = {
  name: 'Phase 2',
  id: '2',
  isActive: false,
  split: TRADING_FEE_SPLIT_PHASE_1_TO_4,
  lastBlockIncluded: 0,
  progress: 0,
  feesGenerated: getDefaultFeesGenerated(),
  curationFeesGenerated: getDefaultFeesGenerated(),
  raffleFeesGenerated: getDefaultFeesGenerated(),
  collectionPotFeesGenerated: getDefaultFeesGenerated(),
  treasuryFeesGenerated: getDefaultFeesGenerated(),
  tradingFeeRefund: {
    maxReward: Number.POSITIVE_INFINITY,
    rewardRateNumerator: 5,
    rewardRateDenominator: 1,
    rewardSupply: 200_000_000,
    rewardSupplyUsed: 0,
    buyerPortion: BUYER_PORTION,
    sellerPortion: SELLER_PORTION
  }
};

export const PhaseThree: Omit<TokenomicsPhaseDto, 'index'> = {
  name: 'Phase 3',
  id: '3',
  isActive: false,
  split: TRADING_FEE_SPLIT_PHASE_1_TO_4,
  lastBlockIncluded: 0,
  progress: 0,
  feesGenerated: getDefaultFeesGenerated(),
  curationFeesGenerated: getDefaultFeesGenerated(),
  raffleFeesGenerated: getDefaultFeesGenerated(),
  collectionPotFeesGenerated: getDefaultFeesGenerated(),
  treasuryFeesGenerated: getDefaultFeesGenerated(),
  tradingFeeRefund: {
    maxReward: Number.POSITIVE_INFINITY,
    rewardRateNumerator: 2,
    rewardRateDenominator: 1,
    rewardSupply: 200_000_000,
    rewardSupplyUsed: 0,
    buyerPortion: BUYER_PORTION,
    sellerPortion: SELLER_PORTION
  }
};

export const PhaseFour: Omit<TokenomicsPhaseDto, 'index'> = {
  name: 'Phase 4',
  id: '4',
  isActive: false,
  split: TRADING_FEE_SPLIT_PHASE_1_TO_4,
  lastBlockIncluded: 0,
  progress: 0,
  feesGenerated: getDefaultFeesGenerated(),
  curationFeesGenerated: getDefaultFeesGenerated(),
  raffleFeesGenerated: getDefaultFeesGenerated(),
  collectionPotFeesGenerated: getDefaultFeesGenerated(),
  treasuryFeesGenerated: getDefaultFeesGenerated(),
  tradingFeeRefund: {
    maxReward: Number.POSITIVE_INFINITY,
    rewardRateNumerator: 1,
    rewardRateDenominator: 1,
    rewardSupply: 200_000_000,
    rewardSupplyUsed: 0,
    buyerPortion: BUYER_PORTION,
    sellerPortion: SELLER_PORTION
  }
};

export const PhaseFive: Omit<TokenomicsPhaseDto, 'index'> = {
  name: 'Phase 5',
  id: '5',
  isActive: false,
  split: TRADING_FEE_SPLIT_PHASE_5,
  lastBlockIncluded: 0,
  progress: 0,
  feesGenerated: getDefaultFeesGenerated(),
  curationFeesGenerated: getDefaultFeesGenerated(),
  raffleFeesGenerated: getDefaultFeesGenerated(),
  collectionPotFeesGenerated: getDefaultFeesGenerated(),
  treasuryFeesGenerated: getDefaultFeesGenerated(),
  tradingFeeRefund: null // trading fee refund is no longer active
};

export const DEFAULT_PHASES: TokenomicsPhaseDto[] = [PhaseOne, PhaseTwo, PhaseThree, PhaseFour, PhaseFive].map(
  (item, index) => ({ ...item, index })
);
