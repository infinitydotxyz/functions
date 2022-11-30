import { ChainId } from '@infinityxyz/lib/types/core';

export const chainIdToBasUrl = {
  [ChainId.Mainnet]: 'https://api.reservoir.tools/',
  [ChainId.Goerli]: 'https://api-goerli.reservoir.tools/',
  [ChainId.Polygon]: 'https://api-polygon.reservoir.tools/'
};
