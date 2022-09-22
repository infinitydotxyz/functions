import { Phase } from './phase.abstract';

export class ContinuousPhase extends Phase {
  /**
   * this phase will be active forever
   */
  get isActive(): boolean {
    return true;
  }
}
