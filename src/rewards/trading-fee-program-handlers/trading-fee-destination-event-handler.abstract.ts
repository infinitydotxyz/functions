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

  protected updateFeesGenerated(
    feesGeneratedBeforeSale: FeesGeneratedDto,
    sale: RewardSaleEvent,
    phase: Phase
  ): { eventFees: FeesGeneratedDto } {
    const feePercentage = this.getFeePercentage(phase);

    const eventFeesWei = (BigInt(sale.protocolFeeWei) * BigInt(feePercentage)) / BigInt(100);
    const eventFees: FeesGeneratedDto = {
      feesGeneratedWei: eventFeesWei.toString(),
      feesGeneratedEth: formatEth(eventFeesWei),
      feesGeneratedUSDC: formatEth(eventFeesWei) * sale.ethPrice
    };
    const feesGeneratedWei = (BigInt(feesGeneratedBeforeSale.feesGeneratedWei) + eventFeesWei).toString();
    const feesGeneratedEth = formatEth(feesGeneratedWei);
    feesGeneratedBeforeSale.feesGeneratedWei = feesGeneratedWei;
    feesGeneratedBeforeSale.feesGeneratedEth = feesGeneratedEth;
    feesGeneratedBeforeSale.feesGeneratedUSDC = feesGeneratedEth * sale.ethPrice;

    return {
      eventFees
    };
  }
}
