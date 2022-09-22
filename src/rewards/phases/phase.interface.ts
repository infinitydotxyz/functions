import { TokenomicsPhaseDto } from '@infinityxyz/lib/types/dto';

export interface Phase {
  isActive: boolean;

  toJSON(): TokenomicsPhaseDto;
}
