import { storage } from 'firebase-admin';
import { PassThrough } from 'stream';

import { ChainId, ChainOBOrder, RawFirestoreOrderWithoutError } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { streamQueryWithRef } from '@/firestore/stream-query';
import { Firestore, Query } from '@/firestore/types';

export interface SnapshotMetadata {
  bucket: string;
  file: string;
  chainId: ChainId;
  numOrders: number;
  timestamp: number;
}

export async function takeSnapshot(db: Firestore, chainId: ChainId, fileName: string) {
  const bucketName = 'orderbook-snapshots';
  const file = storage().bucket(bucketName).file(fileName);

  const startTimestamp = Date.now();

  const passthroughStream = new PassThrough();

  const activeOrdersQuery = db
    .collection(firestoreConstants.ORDERS_V2_COLL)
    .where('metadata.chainId', '==', chainId)
    .where('order.status', '==', 'active') as Query<RawFirestoreOrderWithoutError>;

  const streamOrders = async (passThough: PassThrough) => {
    let numOrders = 0;
    const stream = streamQueryWithRef(activeOrdersQuery);
    for await (const item of stream) {
      const orderData: { id: string; order: ChainOBOrder } = {
        id: item.data.metadata.id,
        order: item.data.rawOrder.infinityOrder
      };

      const stringified = JSON.stringify(orderData);

      passThough.write(`${stringified}\n`);

      numOrders += 1;

      if (numOrders % 100 === 0) {
        console.log(`Handled ${numOrders} orders so far`);
      }
    }

    return numOrders;
  };

  const uploadPromise = new Promise<{ numOrders: number }>((resolve, reject) => {
    let numOrders = 0;
    passthroughStream
      .pipe(file.createWriteStream())
      .on('finish', () => {
        resolve({ numOrders });
      })
      .on('error', (err) => {
        reject(err);
      });

    streamOrders(passthroughStream)
      .then((result) => {
        numOrders = result;
        passthroughStream.end();
      })
      .catch((err) => {
        passthroughStream.destroy(err);
      });
  });

  const result = await uploadPromise;

  const metadata = {
    bucket: bucketName,
    file: fileName,
    chainId: chainId,
    numOrders: result.numOrders,
    timestamp: startTimestamp
  };

  await db.collection('orderSnapshots').doc(fileName).set(metadata);

  console.log(`Uploaded ${result.numOrders} orders to ${fileName}`);
}
