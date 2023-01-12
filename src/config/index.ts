import { ethers } from 'ethers';
import { ServiceAccount } from 'firebase-admin';

import { ChainId } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils';

// TODO adi change in release
import * as serviceAccount from '../creds/nftc-dev-firebase-creds.json';

const getEnvVariable = (key: string, required = true): string => {
  if (key in process.env && process.env[key] != null && typeof process.env[key] === 'string') {
    return process.env[key] as string;
  } else if (required) {
    throw new Error(`Missing required environment variable ${key}`);
  }

  return '';
};

const mainnetProviderUrl = getEnvVariable('ALCHEMY_JSON_RPC_ETH_MAINNET', false);
const goerliProviderUrl = getEnvVariable('ALCHEMY_JSON_RPC_ETH_GOERLI', false);

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
  providers: {
    [ChainId.Mainnet]: mainnetProviderUrl ? new ethers.providers.StaticJsonRpcProvider(mainnetProviderUrl, 1) : null,
    [ChainId.Goerli]: goerliProviderUrl ? new ethers.providers.StaticJsonRpcProvider(goerliProviderUrl, 5) : null
  },
  orderbook: {
    gasSimulationAccount: trimLowerCase('0x74265Fc35f4df36d36b4fF18362F14f50790204F')
  }
};
