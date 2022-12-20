import { takeSnapshot } from 'functions/orderbook/snapshot';

import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';

async function main() {
  await takeSnapshot(getDb(), ChainId.Mainnet, 'test-snapshot');
}

void main();
