import { Phase, RewardEpoch, RewardPhase } from '@infinityxyz/lib/types/core';
import { epochs } from './config';

export function getEpochByPhase(phase: Phase): { epoch: RewardEpoch; phase: RewardPhase } {
  const result = epochs.reduce((acc: null | { epoch: RewardEpoch; phase: RewardPhase }, epoch) => {
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