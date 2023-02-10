import { BigNumber } from 'ethers';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { DocRef, Query } from '@/firestore/types';
import { ReservoirOrderEvent } from '@/lib/reservoir/order-events/types';

import { config } from '../config';

async function main() {
  const db = getDb();

  const checkpointFile = resolve(`sync/trigger-order-events-${config.isDev ? 'dev' : 'prod'}.txt`);
  const checkpoint = await readFile(checkpointFile, 'utf8');
  const saveCheckpoint = async (ref: DocRef<ReservoirOrderEvent>) => {
    await writeFile(checkpointFile, ref.path);
  };

  let query = db.collectionGroup('reservoirOrderEvents') as unknown as Query<ReservoirOrderEvent>;

  if (checkpoint) {
    console.log(`Continuing from last checkpoint: ${checkpoint}`);
    const startAfterRef = db.doc(checkpoint);
    query = query.startAfter(startAfterRef);
  }

  const stream = streamQueryWithRef(query);

  const batch = new BatchHandler(100);
  let triggered = 0;
  let items = 0;
  const start = Date.now();
  const count = '0x00b31963b53c3d35fe0590e0f3ea1a69bb18cabfde7a8b12c990487813a84195'.length;
  const min = BigNumber.from('0x'.padEnd(count, '0'));
  const max = BigNumber.from('0x'.padEnd(count, 'f'));

  const trigger = async (data: ReservoirOrderEvent, ref: DocRef<ReservoirOrderEvent>) => {
    triggered += 1;
    data.data.order.contract;
    await batch.addAsync(
      ref,
      {
        metadata: {
          ...data.metadata,
          processed: false,
          hasError: false
        },
        error: null
      },
      { merge: true }
    );

    const rate = items / ((Date.now() - start) / 1000);
    const current = BigNumber.from(ref.parent.parent?.id ?? '0x0');
    const progress = current.sub(min).mul(10000).div(max.sub(min)).toNumber() / 100;
    console.log(`Triggering event ${ref.path} - Rate ${rate.toFixed(2)} docs/s - Progress ${progress.toFixed(2)}%`);
    if (triggered % 500 === 0) {
      await saveCheckpoint(ref);
    }
  };

  for await (const { data, ref } of stream) {
    items += 1;
    if ('error' in data && data.error && data.error.errorCode !== 1) {
      switch (data.error.reason) {
        case 'Invalid complication address': {
          await trigger(data, ref);
          break;
        }

        case 'unexpected order: unexpected order: error': {
          if (data.error.value.includes('failed to get reservoir order')) {
            await trigger(data, ref);
          } else {
            console.log(`Unhandled reason: ${data.error.reason} - ${data.error.value}`);
          }
          break;
        }
        case 'unsupported order: unsupported order: dynamic order': {
          break;
        }
        case 'unsupported order: unsupported order: non-erc721 order': {
          break;
        }
        case 'unexpected order: unexpected order: not found': {
          break;
        }
        case 'unsupported order: unsupported order: order currency': {
          break;
        }
        case 'unsupported order: unsupported order: order side': {
          if (data.error.value.includes('buy')) {
            break;
          } else {
            console.log(`Unhandled reason: ${data.error.reason} - ${data.error.value} - ${ref.path}`);
          }
          break;
        }
        default: {
          if (data.error.reason.includes('No txHash found for event')) {
            await trigger(data, ref);
          } else {
            console.log(`Unhandled reason: ${data.error.reason} - ${data.error.value} - ${ref.path}`);
          }
        }
      }
    }
  }

  await batch.flush();

  console.log(`Complete: Triggered `);
}

void main();
