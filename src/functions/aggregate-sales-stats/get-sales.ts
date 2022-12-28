import { NftSale } from '@infinityxyz/lib/types/core/NftSale';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { streamQuery } from '@/firestore/stream-query';

import { SalesRequestOptions } from './types';

export async function getSales(options: SalesRequestOptions) {
  let salesStream;
  if ('fromBlock' in options) {
    salesStream = getSalesByBlock(options.fromBlock, options.toBlock);
  } else {
    salesStream = getSalesByTimestamp(options.from, options.to);
  }

  const salesArray: NftSale[] = [];
  for await (const sale of salesStream) {
    salesArray.push(sale);
  }
  return salesArray;
}

function getSalesByTimestamp(from: number, to: number, startAfterHash?: string): AsyncGenerator<NftSale> {
  const db = getDb();
  const salesQuery = db
    .collection(firestoreConstants.SALES_COLL)
    .where('timestamp', '>=', from)
    .where('timestamp', '<', to)
    .orderBy('timestamp', 'asc')
    .orderBy('txHash', 'asc') as FirebaseFirestore.Query<NftSale>;
  const startAfter = startAfterHash ? { startAfter: startAfterHash } : {};
  const sales = streamQuery<NftSale>(salesQuery, (item) => [item.timestamp, item.txHash], {
    pageSize: 300,
    ...startAfter
  });
  return sales;
}

function getSalesByBlock(fromBlock: number, toBlock: number, startAfterHash?: string): AsyncGenerator<NftSale> {
  const db = getDb();
  const salesQuery = db
    .collection(firestoreConstants.SALES_COLL)
    .where('blockNumber', '>=', fromBlock)
    .where('blockNumber', '<', toBlock)
    .orderBy('blockNumber')
    .orderBy('txHash', 'asc') as FirebaseFirestore.Query<NftSale>;
  const startAfter = startAfterHash ? { startAfter: startAfterHash } : {};
  const sales = streamQuery<NftSale>(salesQuery, (item) => [item.blockNumber, item.txHash], {
    pageSize: 300,
    ...startAfter
  });
  return sales;
}
