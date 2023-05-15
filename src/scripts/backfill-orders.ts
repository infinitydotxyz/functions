import { ChainId } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { backfillActiveListings } from '@/lib/reservoir/order-events/backfill-active-orders';

async function main() {
  const db = getDb();
  if (process.argv.length !== 3) {
    throw new Error(
      'Invalid number of arguments. Usage is: npm run backfill-reservoir-orders <chainId>:<collectionAddress>'
    );
  }

  if (trimLowerCase(process.argv[2]) === 'all') {
    const supportedCollections = new SupportedCollectionsProvider(db);
    await supportedCollections.init();

    for (const item of supportedCollections.values()) {
      const [chainId, collectionAddress] = item.split(':');
      await backfillActiveListings(chainId as ChainId, trimLowerCase(collectionAddress), db);
    }
  } else {
    const chainId = process.argv[2].split(':')[0];
    const collectionAddress = process.argv[2].split(':')[1].toLowerCase();
    if (chainId === '1') {
      await backfillActiveListings(ChainId.Mainnet, trimLowerCase(collectionAddress), db);
    } else if (chainId === '5') {
      await backfillActiveListings(ChainId.Goerli, trimLowerCase(collectionAddress), db);
    } else {
      throw new Error('Invalid chain id');
    }
  }
}

void main();
