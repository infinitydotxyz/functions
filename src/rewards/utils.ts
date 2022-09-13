import { Phase } from '@infinityxyz/lib/types/core';
import { RewardEpochDto, RewardPhaseDto } from '@infinityxyz/lib/types/dto/rewards';
import { epochs } from './config';

export function getEpochByPhase(phase: Phase): { epoch: RewardEpochDto; phase: RewardPhaseDto } {
  const result = epochs.reduce((acc: null | { epoch: RewardEpochDto; phase: RewardPhaseDto }, epoch) => {
    const rewardPhase = epoch.phases.find((item) => item.name === phase);
    if (rewardPhase) {
      return { epoch, phase: rewardPhase };
    }
    return acc;
  }, null);

  if (!result) {
    throw new Error(`Could not find epoch for phase ${phase}`);
  }

  return result;
}
