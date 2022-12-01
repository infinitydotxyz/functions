import { ethers } from 'ethers';

import { InfinityStakerABI } from '@infinityxyz/lib/abi/infinityStaker';
import { ChainId } from '@infinityxyz/lib/types/core';

import { getProvider } from './ethersUtils';

export const getCachedUserStakeLevel = () => {
  const cache: Map<string, Promise<number | null>> = new Map();
  const getCacheId = (
    userAddress: string,
    stakerContractAddress: string,
    stakerContractChainId: ChainId,
    blockNumber: number
  ) => {
    return `${userAddress}-${stakerContractAddress}-${stakerContractChainId}-${blockNumber}`;
  };
  const getUserStakeLevel = (
    userAddress: string,
    stakerContractAddress: string,
    stakerContractChainId: ChainId,
    blockNumber: number
  ) => {
    const id = getCacheId(userAddress, stakerContractAddress, stakerContractChainId, blockNumber);
    const cachedStakeLevel = cache.get(id);

    const getStakeLevel = async (): Promise<number | null> => {
      try {
        const stakerContract = new ethers.Contract(
          stakerContractAddress,
          InfinityStakerABI,
          getProvider(stakerContractChainId)
        );
        const [stakeLevel] = (await stakerContract.functions.getUserStakeLevel(userAddress, {
          blockTag: blockNumber
        })) as [number];
        return stakeLevel;
      } catch (err) {
        console.error(err);
        return null;
      }
    };

    if (cachedStakeLevel) {
      return cachedStakeLevel;
    }
    const promise = getStakeLevel();
    cache.set(id, promise);
    return promise;
  };

  return getUserStakeLevel;
};
