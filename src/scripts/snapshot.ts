import { takeSnapshot } from 'functions/orderbook/snapshot';

import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';

import { config } from '../config';

async function main() {
  const bucketName = config.firebase.snapshotBucket;
  await takeSnapshot(getDb(), ChainId.Mainnet, bucketName, 'test-snapshot');
}

void main();
