import { RewardEvent, RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { TokenomicsPhase } from '../../tokenomics/types';
import {
  TradingFeeEventHandlerResponse,
  TradingFeeProgramEventHandler as ITradingFeeProgramEventHandler
} from '../types';

export abstract class TradingFeeProgramEventHandler implements ITradingFeeProgramEventHandler {
  onEvent(event: RewardEvent, phase: TokenomicsPhase): TradingFeeEventHandlerResponse {
    if ('txHash' in event && 'price' in event && 'buyer' in event && 'seller' in event) {
      return this._onSale(event, phase);
    } else {
      console.log(JSON.stringify(event, null, 2));
      throw new Error(`Unknown event ${(event as any)?.discriminator}`);
    }
  }

  protected abstract _onSale(sale: RewardSaleEvent, phase: TokenomicsPhase): TradingFeeEventHandlerResponse;

  protected _nonApplicableResponse(phase: TokenomicsPhase): TradingFeeEventHandlerResponse {
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
