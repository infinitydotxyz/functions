import { RewardEvent, RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { TradingFeeDestination, TradingFeeProgram } from '@infinityxyz/lib/types/dto';
import { Phase, ProgressAuthority } from '../phases/phase.abstract';
import { TradingFeeEventHandlerResponse } from '../types';
import { TradingFeeDestinationEventHandler } from './trading-fee-destination-event-handler.abstract';

export class TreasuryHandler extends TradingFeeDestinationEventHandler {
  constructor() {
    super(TradingFeeProgram.Treasury, TradingFeeDestination.Treasury);
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
    } else if (phase.authority === ProgressAuthority.Treasury) {
      throw new Error('Sale splitting must be implemented for treasury handler before a treasury authority can be used');
    }

    const isApplicable = this._isApplicable(sale, phase);
    if (!isApplicable) {
      return this._nonApplicableResponse(phase);
    }

    const fees = phase.details.treasuryFeesGenerated;
    const { eventFees } = this.updateFeesGenerated(fees, sale, phase);
    return {
      applicable: true,
      phase,
      saveEvent: (txn, db) => {
        // TODO update treasury docs
      },
      split: undefined
    };
  }
}
