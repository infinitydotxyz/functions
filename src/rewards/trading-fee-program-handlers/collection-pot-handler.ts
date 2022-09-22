import { RewardEvent, RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { TradingFeeDestination, TradingFeeProgram } from '@infinityxyz/lib/types/dto';
import { Phase, ProgressAuthority } from '../phases/phase.abstract';
import { TradingFeeEventHandlerResponse } from '../types';
import { TradingFeeDestinationEventHandler } from './trading-fee-destination-event-handler.abstract';

export class CollectionPotHandler extends TradingFeeDestinationEventHandler {
  constructor() {
    super(TradingFeeProgram.CollectionPot, TradingFeeDestination.CollectionPot);
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
    } else if (phase.authority === ProgressAuthority.CollectionPot) {
      throw new Error('Sale splitting must be implemented for collection pot handler before a collection pot authority can be used');
    }

    const isApplicable = this._isApplicable(sale, phase);
    if (!isApplicable) {
      return this._nonApplicableResponse(phase);
    }

    const fees = phase.details.collectionPotFeesGenerated;
    const { eventFees } = this.updateFeesGenerated(fees, sale, phase);
    return {
      applicable: true,
      phase,
      saveEvent: (txn, db) => {
        // TODO update collection pot docs
      },
      split: undefined
    };
  }
}
