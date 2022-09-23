import { ChainId } from '@infinityxyz/lib/types/core';
import { FeesGeneratedDto } from '@infinityxyz/lib/types/dto';

export interface TreasuryDoc {
  // TODO move to lib, use firestore constants for paths
  chainId: ChainId;
  feesGenerated: Omit<FeesGeneratedDto, 'feesGeneratedUSDC'>;
  phases: {
    [id: string]: {
      phaseName: string;
      phaseId: string;
      phaseIndex: number;
      feesGenerated: Omit<FeesGeneratedDto, 'feesGeneratedUSDC'>;
    };
  };
}
