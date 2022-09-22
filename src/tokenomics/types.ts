export enum TradingFeeProgram {
  Curators = 'CURATORS',
  Raffle = 'RAFFLE',
  CollectionPot = 'COLLECTION_POT',
  Treasury = 'TREASURY',
  TokenRefund = 'TOKEN_REFUND'
}

export enum TradingFeeDestination {
  Curators = TradingFeeProgram.Curators,
  Raffle = TradingFeeProgram.Raffle,
  CollectionPot = TradingFeeProgram.CollectionPot,
  Treasury = TradingFeeProgram.Treasury
}

export type TradingFeeSplit = Record<TradingFeeDestination, { percentage: number }>;

export type FeesGenerated = {
  feesGeneratedWei: string;
  feesGeneratedEth: number;
  feesGeneratedUSDC: number;
};

export type TokenomicsPhase = {
  name: string;

  index: number;

  id: string;

  isActive: boolean;

  split: TradingFeeSplit;

  lastBlockIncluded: number;

  progress: number;

  feesGenerated: FeesGenerated;

  curationFeesGenerated: FeesGenerated;

  raffleFeesGenerated: FeesGenerated;

  collectionPotFeesGenerated: FeesGenerated;

  treasuryFeesGenerated: FeesGenerated;

  tradingFeeRefund: TradingFeeRefund | null;
};

export type TradingFeeRefund = {
  maxReward: number;
  rewardRateNumerator: number;
  rewardRateDenominator: number;
  rewardSupply: number;
  rewardSupplyUsed: number;
  progress: number;
  buyerPortion: number;
  sellerPortion: number;
};
