import {
  FeesGeneratedDto,
  RaffleTicketConfigDto,
  TokenomicsPhaseDto,
  TradingFeeDestination,
  TradingFeeSplit
} from '@infinityxyz/lib/types/dto';
import { ONE_WEEK } from '@infinityxyz/lib/utils';

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

export const DEFAULT_RAFFLE_CONFIG: RaffleTicketConfigDto = {
  listing: {
    maxPercentAboveFloor: 5,
    minTimeValid: ONE_WEEK,
    ticketMultiplier: 100
  },
  offer: {
    maxPercentBelowFloor: 0,
    minTimeValid: ONE_WEEK,
    ticketMultiplier: 500
  },
  volume: {
    ticketRateNumerator: 1,
    ticketRateDenominator: 1
  }
};

const BUYER_PORTION = 0.7;
const SELLER_PORTION = 0.3;

export const getDefaultFeesGenerated = (): FeesGeneratedDto => ({
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
    rewardRateNumerator: 20,
    rewardRateDenominator: 1,
    rewardSupply: 200_000_000,
    rewardSupplyUsed: 0,
    buyerPortion: BUYER_PORTION,
    sellerPortion: SELLER_PORTION
  },
  raffleConfig: {
    grandPrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG },
    phasePrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG }
  },
  referralConfig: {
    destinationPayer: TradingFeeDestination.Treasury,
    percentageOfDestinationFees: 0
  },
  referralFeesGenerated: getDefaultFeesGenerated()
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
    rewardRateNumerator: 10,
    rewardRateDenominator: 1,
    rewardSupply: 200_000_000,
    rewardSupplyUsed: 0,
    buyerPortion: BUYER_PORTION,
    sellerPortion: SELLER_PORTION
  },
  raffleConfig: {
    grandPrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG },
    phasePrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG }
  },
  referralConfig: {
    destinationPayer: TradingFeeDestination.Treasury,
    percentageOfDestinationFees: 0
  },
  referralFeesGenerated: getDefaultFeesGenerated()
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
    rewardRateNumerator: 5,
    rewardRateDenominator: 1,
    rewardSupply: 200_000_000,
    rewardSupplyUsed: 0,
    buyerPortion: BUYER_PORTION,
    sellerPortion: SELLER_PORTION
  },
  raffleConfig: {
    grandPrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG },
    phasePrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG }
  },
  referralConfig: {
    destinationPayer: TradingFeeDestination.Treasury,
    percentageOfDestinationFees: 0
  },
  referralFeesGenerated: getDefaultFeesGenerated()
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
    rewardRateNumerator: 2,
    rewardRateDenominator: 1,
    rewardSupply: 200_000_000,
    rewardSupplyUsed: 0,
    buyerPortion: BUYER_PORTION,
    sellerPortion: SELLER_PORTION
  },
  raffleConfig: {
    grandPrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG },
    phasePrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG }
  },
  referralConfig: {
    destinationPayer: TradingFeeDestination.Treasury,
    percentageOfDestinationFees: 0
  },
  referralFeesGenerated: getDefaultFeesGenerated()
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
  tradingFeeRefund: null, // trading fee refund is no longer active
  raffleConfig: null, // raffle is no longer active
  referralConfig: {
    destinationPayer: TradingFeeDestination.Treasury,
    percentageOfDestinationFees: 0
  },
  referralFeesGenerated: getDefaultFeesGenerated()
};

export const DEFAULT_PHASES: TokenomicsPhaseDto[] = [PhaseOne, PhaseTwo, PhaseThree, PhaseFour, PhaseFive].map(
  (item, index) => ({ ...item, index })
);
