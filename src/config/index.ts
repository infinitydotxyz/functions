import { ServiceAccount } from 'firebase-admin';

import { ChainId } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils';

import * as serviceAccount from '../creds/nftc-infinity-firebase-creds.json';

const getEnvVariable = (key: string, required = true): string => {
  if (key in process.env && process.env[key] != null && typeof process.env[key] === 'string') {
    return process.env[key] as string;
  } else if (required) {
    throw new Error(`Missing required environment variable ${key}`);
  }

  return '';
};

export const config = {
  firebase: {
    serviceAccount: serviceAccount as ServiceAccount,
    region: 'us-east1'
  },
  reservoir: {
    apiKey: getEnvVariable('RESERVOIR_API_KEY', false),
    baseUrls: {
      [ChainId.Mainnet]: getEnvVariable('RESERVOIR_BASE_URL_MAINNET', false) || 'https://api.reservoir.tools/',
      [ChainId.Goerli]: getEnvVariable('RESERVOIR_BASE_URL_GOERLI', false) || 'https://api-goerli.reservoir.tools/',
      [ChainId.Polygon]: getEnvVariable('RESERVOIR_BASE_URL_POLYGON', false) || 'https://api-polygon.reservoir.tools/'
    }
  },
  orderbook: {
    gasSimulationAccount: trimLowerCase('0x74265Fc35f4df36d36b4fF18362F14f50790204F')
  }
};
