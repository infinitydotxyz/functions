import { Phase, ProgressAuthority } from './phase.abstract';

export class ContinuousPhase extends Phase {
  readonly authority = ProgressAuthority.None;

  /**
   * this phase will be active forever
   */
  get isActive(): boolean {
    return true;
  }
}
