import { RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { FeesGeneratedDto, TradingFeeDestination, TradingFeeProgram } from '@infinityxyz/lib/types/dto';
import { formatEth } from '@infinityxyz/lib/utils';
import { Phase } from '../phases/phase.abstract';
import { TradingFeeProgramEventHandler } from './trading-fee-program-event-handler.abstract';

export abstract class TradingFeeDestinationEventHandler extends TradingFeeProgramEventHandler {
  constructor(programVariant: TradingFeeProgram, protected readonly _feeDestinationVariant: TradingFeeDestination) {
    super(programVariant);
  }

  protected getFeePercentage(phase: Phase) {
    return phase.details.split[this._feeDestinationVariant].percentage;
  }

  protected updateFeesGenerated(feesGeneratedBeforeSale: FeesGeneratedDto, sale: RewardSaleEvent, phase: Phase) {
    const feePercentage = this.getFeePercentage(phase);
    const totalFeesGeneratedWei = BigInt(feesGeneratedBeforeSale.feesGeneratedWei) + BigInt(sale.protocolFeeWei);
    const feesGeneratedWei = ((totalFeesGeneratedWei * BigInt(feePercentage)) / BigInt(100)).toString();
    const feesGeneratedEth = formatEth(feesGeneratedWei);
    feesGeneratedBeforeSale.feesGeneratedWei = feesGeneratedWei;
    feesGeneratedBeforeSale.feesGeneratedEth = feesGeneratedEth;
    feesGeneratedBeforeSale.feesGeneratedUSDC = feesGeneratedEth * sale.ethPrice;
  }
}
