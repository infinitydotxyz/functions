import { config as loadEnv } from 'dotenv';
import { ethers } from 'ethers';
import { ServiceAccount } from 'firebase-admin';
import Redis from 'ioredis';
import Redlock from 'redlock';

import { ChainId } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils';

import * as serviceAccountDev from '../creds/nftc-dev-firebase-creds.json';
import * as serviceAccountProd from '../creds/nftc-infinity-firebase-creds.json';
import { parseSupportedChains } from './parse-supported-chains';

const getEnvVariable = (key: string, required = true): string => {
  if (key in process.env && process.env[key] != null && typeof process.env[key] === 'string') {
    return process.env[key] as string;
  } else if (required) {
    throw new Error(`Missing required environment variable ${key}`);
  }

  return '';
};

const isProd = getEnvVariable('INFINITY_NODE_ENV', false) !== 'dev';
const serviceAccount = (isProd ? serviceAccountProd : serviceAccountDev) as ServiceAccount;
const isDeployed =
  Number(getEnvVariable('DEPLOYED', false)) === 1 ||
  !!getEnvVariable('GCLOUD_PROJECT', false) ||
  !!getEnvVariable('GOOGLE_CLOUD_PROJECT', false);

const env = `.env.${isProd ? 'production' : 'development'}.${isDeployed ? 'deploy' : 'local'}`;
console.log('config', `Loading environment variables from ${env}`);
loadEnv({ path: `.env` });
loadEnv({ path: env, override: true });

const DEV_SERVER_BASE_URL = isDeployed ? '' : 'http://localhost:9090';
const PROD_SERVER_BASE_URL = 'https://sv.pixl.so/';

const mainnetProviderUrl = getEnvVariable('ALCHEMY_JSON_RPC_ETH_MAINNET', true);
const goerliProviderUrl = getEnvVariable('ALCHEMY_JSON_RPC_ETH_GOERLI', false);
const polygonProviderUrl = getEnvVariable('ALCHEMY_JSON_RPC_ETH_POLYGON', true);

const redisConnectionUrl = getEnvVariable('REDIS_URL', false);
let redis: Redis;
const getRedis = () => {
  if (!redis && redisConnectionUrl) {
    redis = new Redis(redisConnectionUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });
  }
  return redis;
};

let redlock: Redlock;
const getRedlock = () => {
  if (!redlock) {
    const redis = getRedis();
    if (redis) {
      redlock = new Redlock([redis.duplicate()], { retryCount: 0 });
    }
  }
  return redlock;
};

export const config = {
  isDev: !isProd,
  isDeployed,
  supportedChains: parseSupportedChains(getEnvVariable('SUPPORTED_CHAINS', false)),
  flow: {
    serverBaseUrl: isProd ? PROD_SERVER_BASE_URL : DEV_SERVER_BASE_URL,
    apiKey: getEnvVariable('FLOW_API_KEY', false)
  },
  firebase: {
    serviceAccount,
    region: 'us-east1',
    snapshotBucket: isProd ? 'infinity-orderbook-snapshots' : 'orderbook-snapshots'
  },
  redis: {
    connectionUrl: redisConnectionUrl,
    getRedis,
    getRedlock
  },
  reservoir: {
    apiKey: getEnvVariable('RESERVOIR_API_KEY', false),
    baseUrls: {
      Ethereum: {
        chainId: 1,
        api: 'https://api.reservoir.tools',
        ws: 'wss://ws.reservoir.tools'
      },
      Goerli: {
        chainId: 5,
        api: 'https://api-goerli.reservoir.tools',
        ws: 'wss://ws-goerli.reservoir.tools'
      },
      Sepolia: {
        chainId: 6,
        api: 'https://api-sepolia.reservoir.tools',
        ws: 'wss://ws-sepolia.reservoir.tools'
      },
      Polygon: {
        chainId: 137,
        api: 'https://api-polygon.reservoir.tools',
        ws: 'wss://ws-polygon.reservoir.tools'
      },
      Mumbai: {
        chainId: 80001,
        api: 'https://api-mumbai.reservoir.tools',
        ws: 'wss://ws-mumbai.reservoir.tools'
      },
      BNB: {
        chainId: 56,
        api: 'https://api-bsc.reservoir.tools',
        ws: 'wss://ws-bsc.reservoir.tools'
      },
      Arbitrum: {
        chainId: 42161,
        api: 'https://api-arbitrum.reservoir.tools',
        ws: 'wss://ws-arbitrum.reservoir.tools'
      },
      Optimism: {
        chainId: 10,
        api: 'https://api-optimism.reservoir.tools',
        ws: 'wss://ws-optimism.reservoir.tools'
      },
      ArbitrumNova: {
        chainId: 42170,
        api: 'https://api-arbitrum-nova.reservoir.tools',
        ws: 'wss://ws-arbitrum-nova.reservoir.tools'
      },
      Base: {
        chainId: 8453,
        api: 'https://api-base.reservoir.tools',
        ws: 'wss://ws-base.reservoir.tools'
      },
      BaseGoerli: {
        chainId: 84531,
        api: 'https://api-base-goerli.reservoir.tools',
        ws: 'wss://ws-base-goerli.reservoir.tools'
      },
      Zora: {
        chainId: 7777777,
        api: 'https://api-zora.reservoir.tools',
        ws: 'wss://ws-zora.reservoir.tools'
      },
      ZoraGoerli: {
        chainId: 999,
        api: 'https://api-zora-testnet.reservoir.tools',
        ws: 'wss://ws-zora-testnet.reservoir.tools'
      },
      ScrollAlpha: {
        chainId: 534353,
        api: 'https://api-scroll-alpha.reservoir.tools',
        ws: 'wss://ws-scroll-alpha.reservoir.tools'
      },
      Linea: {
        chainId: 59144,
        api: 'https://api-linea.reservoir.tools',
        ws: 'wss://ws-linea.reservoir.tools'
      }
    }
  },
  providers: {
    ['1']: mainnetProviderUrl ? new ethers.providers.StaticJsonRpcProvider(mainnetProviderUrl, 1) : null,
    ['5']: goerliProviderUrl ? new ethers.providers.StaticJsonRpcProvider(goerliProviderUrl, 5) : null,
    ['137']: polygonProviderUrl ? new ethers.providers.StaticJsonRpcProvider(polygonProviderUrl, 137) : null
  },
  orderbook: {
    gasSimulationAccount: {
      [ChainId.Mainnet]: trimLowerCase('0xDBd8277e2E16aa40f0e5D3f21ffe600Ad706D979'),
      [ChainId.Goerli]: trimLowerCase('0xbd9573b68297E6F0E01c4D64D6faED7c737024b5'),
      [ChainId.Polygon]: trimLowerCase('0xDBd8277e2E16aa40f0e5D3f21ffe600Ad706D979')
    }
  },
  components: {
    syncSales: {
      enabled: Number(getEnvVariable('SYNC_SALES', false)) === 1
    },
    rewards: {
      enabled: Number(getEnvVariable('PROCESS_REWARDS', false)) === 1
    },
    ingestOrderEvents: {
      enabled: Number(getEnvVariable('INGEST_ORDER_EVENTS', false)) === 1
    },
    syncOrders: {
      enabled: Number(getEnvVariable('SYNC_ORDERS', false)) === 1
    },
    cacheReservoirOrders: {
      enabled: Number(getEnvVariable('SYNC_RESERVOIR_ORDERS_CACHE', false)) === 1
    },
    validateOrderbook: {
      enabled: Number(getEnvVariable('VALIDATE_ORDERBOOK', false)) === 1
    },
    indexerEventSyncing: {
      enabled: Number(getEnvVariable('INDEXER_EVENT_SYNCING', false)) === 1
    },
    indexerEventProcessing: {
      enabled: Number(getEnvVariable('INDEXER_EVENT_PROCESSING', false)) === 1
    },
    purgeFirestore: {
      enabled: Number(getEnvVariable('PURGE_FIRESTORE', false)) === 1,
      runOnStartup: Number(getEnvVariable('PURGE_FIRESTORE_ON_STARTUP', false)) === 1,
      concurrency: Number(getEnvVariable('PURGE_FIRESTORE_CONCURRENCY', false)) || 16
    },
    api: {
      apiKey: getEnvVariable('API_KEY', false),
      port: Number(getEnvVariable('PORT', false) || 8080)
    }
  }
};
