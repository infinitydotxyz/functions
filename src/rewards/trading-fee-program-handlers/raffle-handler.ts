import { RewardEvent, RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { TradingFeeDestination, TradingFeeProgram } from '@infinityxyz/lib/types/dto';
import { Phase, ProgressAuthority } from '../phases/phase.abstract';
import { TradingFeeEventHandlerResponse } from '../types';
import { TradingFeeDestinationEventHandler } from './trading-fee-destination-event-handler.abstract';

export class RaffleHandler extends TradingFeeDestinationEventHandler {
  constructor() {
    super(TradingFeeProgram.Raffle, TradingFeeDestination.Raffle);
  }

  protected _isApplicable(event: RewardEvent, phase: Phase): boolean {
    if (this.getFeePercentage(phase) > 0) {
      return true;
    }

    return false;
  }

  protected _onSale(sale: RewardSaleEvent, phase: Phase): TradingFeeEventHandlerResponse {
    if (!phase.isActive) {
      throw new Error('Phase is not active');
    } else if (phase.authority === ProgressAuthority.Raffle) {
      throw new Error('Sale splitting must be implemented for raffle handler before a raffle authority can be used');
    }

    const isApplicable = this._isApplicable(sale, phase);
    if (!isApplicable) {
      return this._nonApplicableResponse(phase);
    }

    const fees = phase.details.raffleFeesGenerated;
    const { eventFees } = this.updateFeesGenerated(fees, sale, phase);
    const phasePrizePercent = phase.details.raffleConfig?.phasePrize?.percentage ?? 0;
    const grandPrizePercent = phase.details.raffleConfig?.grandPrize?.percentage ?? 0;

    const phasePrize = (BigInt(eventFees.feesGeneratedWei) * BigInt(phasePrizePercent)) / BigInt(100);
    const grandPrize = (BigInt(eventFees.feesGeneratedWei) * BigInt(grandPrizePercent)) / BigInt(100);

    return {
      applicable: true,
      phase,
      saveEvent: (txn, db) => {
        // TODO update raffle docs
      },
      split: undefined
    };
  }
}
