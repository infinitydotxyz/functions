import { takeSnapshot } from 'functions/orderbook/snapshot';

import { ChainId } from '@infinityxyz/lib/types/core';

async function main() {
  await takeSnapshot(ChainId.Mainnet);
}

void main();
