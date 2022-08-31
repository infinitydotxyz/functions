import { RewardEpoch } from './reward-epoch';
import { RewardPhase } from './reward-phase';
import { RewardPhase as IRewardPhase } from '@infinityxyz/lib/types/core';
import { getMockRewardPhaseConfig } from './reward-phase.spec';

const getMockRewardEpochConfig = (phases: IRewardPhase[], startsAt: number = Date.now()) => {
  return {
    name: 'Test reward epoch',
    startsAt,
    isActive: false,
    phases
  };
};

describe('RewardEpoch', () => {
  it("should be inactive if it doesn't have any active phases", () => {
    const epochConfig = getMockRewardEpochConfig([], Date.now() - 2000);
    const epoch = new RewardEpoch(epochConfig);

    expect(epoch.isActive).toBe(false);
  });

  it('should be inactive if there is an active phase and we have not reached starts at', () => {
    const phaseConfig = getMockRewardPhaseConfig(100, 0);
    const phase = new RewardPhase(phaseConfig);
    expect(phase.isActive).toBe(true);

    const epochConfig = getMockRewardEpochConfig([phaseConfig], Date.now() + 20_000);
    const epoch = new RewardEpoch(epochConfig);
    expect(epoch.isActive).toBe(false);
  });

  it('should be active if there is an active phase and we have reached stats at', () => {
    const phaseConfig = getMockRewardPhaseConfig(100, 0);
    const phase = new RewardPhase(phaseConfig);
    expect(phase.isActive).toBe(true);

    const epochConfig = getMockRewardEpochConfig([phaseConfig], Date.now() - 20_000);
    const epoch = new RewardEpoch(epochConfig);
    expect(epoch.isActive).toBe(true);
  });

  it('should update isActive when converting to json', () => {
    const phaseConfig = getMockRewardPhaseConfig(100, 0);
    const phase = new RewardPhase(phaseConfig);
    expect(phase.isActive).toBe(true);

    const epochConfig = getMockRewardEpochConfig([phaseConfig], Date.now() - 20_000);
    expect(epochConfig.isActive).toBe(false);

    const epoch = new RewardEpoch(epochConfig);
    expect(epoch.isActive).toBe(true);

    expect(epoch.toJSON().isActive).toBe(true);
  });
});
