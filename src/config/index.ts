import { config as loadEnv } from 'dotenv';
import { ethers } from 'ethers';
import { ServiceAccount } from 'firebase-admin';
import Redis from 'ioredis';
import pgPromise from 'pg-promise';
import pg from 'pg-promise/typescript/pg-subset';
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
const PROD_SERVER_BASE_URL = 'https://sv.flow.so/';

const mainnetProviderUrl = getEnvVariable('ALCHEMY_JSON_RPC_ETH_MAINNET', false);
const goerliProviderUrl = getEnvVariable('ALCHEMY_JSON_RPC_ETH_GOERLI', false);

const mainnetIndexerProviderUrl = getEnvVariable('INDEXER_JSON_RPC_ETH_MAINNET', false) || mainnetProviderUrl;
const goerliIndexerProviderUrl = getEnvVariable('INDEXER_JSON_RPC_ETH_GOERLI', false) || goerliProviderUrl;

const user = getEnvVariable('DB_USER', false);
const password = getEnvVariable('DB_PASS', false);
const database = getEnvVariable('DB_NAME', false);
const instanceSocket = getEnvVariable('INSTANCE_UNIX_SOCKET', false);
const host = getEnvVariable('DB_HOST', false);
const port = Number(getEnvVariable('DB_PORT', false));
let _pg:
  | {
      pgDB: pgPromise.IDatabase<any, pg.IClient>;
      pgp: pgPromise.IMain<any, pg.IClient>;
      pgConnection: pg.IConnectionParameters<any>;
    }
  | undefined;

const getPG = () => {
  if (!_pg) {
    if (!user || !password || !database) {
      console.warn('Missing PG DB credentials, skipping DB connection');
      return;
    }

    const url = instanceSocket
      ? { host: instanceSocket }
      : {
          port,
          host
        };

    if ('host' in url && !url.host) {
      console.warn('Missing PG DB credentials, skipping DB connection');
      return;
    } else if ('port' in url && !url.port) {
      console.warn('Missing PG DB credentials, skipping DB connection');
      return;
    }

    const pgConnection = {
      ...url,
      database,
      user,
      password,
      max: 50,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 20000,
      keepAlive: true
    };

    const pgp = pgPromise({
      capSQL: true
    });
    _pg = { pgDB: pgp(pgConnection), pgp, pgConnection };
  }
  return _pg;
};

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
  pg: {
    getPG,
    vpcConnector: getEnvVariable('VPC_CONNECTOR', false)
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
    default: {
      [ChainId.Mainnet]: mainnetProviderUrl ? new ethers.providers.StaticJsonRpcProvider(mainnetProviderUrl, 1) : null,
      [ChainId.Goerli]: goerliProviderUrl ? new ethers.providers.StaticJsonRpcProvider(goerliProviderUrl, 5) : null
    },
    indexer: {
      [ChainId.Mainnet]: mainnetProviderUrl
        ? new ethers.providers.StaticJsonRpcProvider(mainnetIndexerProviderUrl, 1)
        : null,
      [ChainId.Goerli]: goerliProviderUrl
        ? new ethers.providers.StaticJsonRpcProvider(goerliIndexerProviderUrl, 5)
        : null
    }
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
    api: {
      apiKey: getEnvVariable('API_KEY', false),
      port: Number(getEnvVariable('PORT', false) || 8080)
    }
  }
};
