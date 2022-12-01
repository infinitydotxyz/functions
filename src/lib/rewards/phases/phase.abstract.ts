import { TokenomicsPhaseDto } from '@infinityxyz/lib/types/dto';

import { Phase as IPhase } from './phase.interface';

export enum ProgressAuthority {
  None = 'NONE', // i.e. continuous
  TradingFees = 'TRADING_FEES',
  Curation = 'CURATION',
  CollectionPot = 'COLLECTION_POT',
  Raffle = 'RAFFLE',
  Treasury = 'TREASURY'
}

export abstract class Phase implements IPhase {
  public abstract readonly authority: ProgressAuthority;
  /**
   * implement isActive to determine progression of phases
   *
   * once this phase is no longer active, the next phase
   * will be started
   */
  public abstract isActive: boolean;

  constructor(protected _phase: TokenomicsPhaseDto) {}

  public toJSON(): TokenomicsPhaseDto {
    return {
      ...this._phase,
      isActive: this.isActive
    };
  }

  public get details(): TokenomicsPhaseDto {
    return this._phase;
  }

  public get lastBlockIncluded(): number {
    return this._phase.lastBlockIncluded;
  }

  /**
   * the last block included should be maintained as the
   * largest block of any event in this phase
   */
  public set lastBlockIncluded(value: number) {
    this._phase.lastBlockIncluded = value;
  }
}
