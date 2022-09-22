import { TokenomicsPhase } from '../../tokenomics/types';
import { Phase as IPhase } from './phase.interface';

export abstract class Phase implements IPhase {
  /**
   * implement isActive to determine progression of phases
   * 
   * once this phase is no longer active, the next phase 
   * will be started
   */
  public abstract isActive: boolean;

  constructor(protected _phase: TokenomicsPhase) {}

  public toJSON(): TokenomicsPhase {
    return {
      ...this._phase,
      isActive: this.isActive
    };
  }

  public get lastBlockIncluded(): number {
    return this._phase.lastBlockIncluded;
  }

  protected set lastBlockIncluded(value: number) {
    this._phase.lastBlockIncluded = value;
  }
}
