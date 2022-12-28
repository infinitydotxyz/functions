import { RewardEvent, RewardEventVariant, RewardListingEvent, RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { TradingFeeProgram } from '@infinityxyz/lib/types/dto';

import { Phase } from '../phases/phase.abstract';
import {
  TradingFeeProgramEventHandler as ITradingFeeProgramEventHandler,
  TradingFeeEventHandlerResponse
} from '../types';

export abstract class TradingFeeProgramEventHandler implements ITradingFeeProgramEventHandler {
  constructor(protected readonly _variant: TradingFeeProgram) {}

  onEvent(event: RewardEvent, phase: Phase): TradingFeeEventHandlerResponse {
    switch (event.discriminator) {
      case RewardEventVariant.Sale: {
        return this._onSale(event, phase);
      }
      case RewardEventVariant.Listing: {
        return this._onListing(event, phase);
      }
      default:
        console.log(JSON.stringify(event, null, 2));
        throw new Error(`Unknown event ${(event as any)?.discriminator}`);
    }
  }

  protected abstract _onSale(sale: RewardSaleEvent, phase: Phase): TradingFeeEventHandlerResponse;

  protected abstract _onListing(sale: RewardListingEvent, phase: Phase): TradingFeeEventHandlerResponse;

  protected _nonApplicableResponse(phase: Phase): TradingFeeEventHandlerResponse {
    return {
      applicable: false,
      phase,
      saveEvent: () => {
        return;
      },
      split: undefined
    };
  }
}
