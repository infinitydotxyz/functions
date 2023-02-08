import { config as loadEnv } from 'dotenv';
import { ethers } from 'ethers';
import { ServiceAccount } from 'firebase-admin';
import pgPromise from 'pg-promise';
import pg from 'pg-promise/typescript/pg-subset';

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

const isDev = serviceAccount.project_id === 'nftc-dev';
const isDeployed = !!getEnvVariable('GCLOUD_PROJECT', false) || !!getEnvVariable('GOOGLE_CLOUD_PROJECT', false);
const env = `.env.${isDev ? 'development' : 'production'}.${isDeployed ? 'deploy' : 'local'}`;
loadEnv({ path: env, override: true });

const DEV_SERVER_BASE_URL = isDeployed ? '' : 'http://localhost:9090';
const PROD_SERVER_BASE_URL = 'https://sv.flow.so/';

const mainnetProviderUrl = getEnvVariable('ALCHEMY_JSON_RPC_ETH_MAINNET', false);
const goerliProviderUrl = getEnvVariable('ALCHEMY_JSON_RPC_ETH_GOERLI', false);

const user = getEnvVariable('DB_USER', false);
const password = getEnvVariable('DB_PASS', false);
const database = getEnvVariable('DB_NAME', false);
const instanceSocket = getEnvVariable('INSTANCE_UNIX_SOCKET', false);
const host = getEnvVariable('DB_HOST', false);
const port = Number(getEnvVariable('DB_PORT', false));

let _pg: { pgDB: pgPromise.IDatabase<any, pg.IClient>; pgp: pgPromise.IMain<any, pg.IClient> };
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
      max: 20,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 20000
    };

    const pgp = pgPromise({
      capSQL: true
    });
    _pg = { pgDB: pgp(pgConnection), pgp };
  }
  return _pg;
};

export const config = {
  isDev,
  flow: {
    serverBaseUrl: isDev ? DEV_SERVER_BASE_URL : PROD_SERVER_BASE_URL,
    apiKey: getEnvVariable('FLOW_API_KEY', false)
  },
  firebase: {
    serviceAccount: serviceAccount as ServiceAccount,
    region: 'us-east1',
    snapshotBucket: isDev ? 'orderbook-snapshots' : 'infinity-orderbook-snapshots'
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
    [ChainId.Mainnet]: mainnetProviderUrl ? new ethers.providers.StaticJsonRpcProvider(mainnetProviderUrl, 1) : null,
    [ChainId.Goerli]: goerliProviderUrl ? new ethers.providers.StaticJsonRpcProvider(goerliProviderUrl, 5) : null
  },
  orderbook: {
    gasSimulationAccount: trimLowerCase('0x74265Fc35f4df36d36b4fF18362F14f50790204F')
  },
  syncs: {
    processSales: Number(getEnvVariable('SYNC_SALES', false)) === 1,
    processOrders: Number(getEnvVariable('SYNC_ORDERS', false)) === 1
  }
};
