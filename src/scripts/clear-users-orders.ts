import { FirestoreOrder } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';

async function clearUsersOrders(userAddresses: string[]) {
  const db = getDb();
  const batchHandler = new FirestoreBatchHandler();
  for(const userAddress of userAddresses) {
    const stream = db.collection(firestoreConstants.ORDERS_COLL).where('makerAddress', '==', userAddress.toLowerCase()).stream() as AsyncIterable<
    FirebaseFirestore.DocumentSnapshot<FirestoreOrder>
    >;
    
    for await (const item of stream) {
      const subCollections = await item.ref.listCollections();
      await Promise.all(subCollections.map(async (subCollection) => {
        const docs = await subCollection.get();
        for (const doc of docs.docs) {
          batchHandler.delete(doc.ref);
        }
      }));
      
      batchHandler.delete(item.ref);
    }
  }

  await batchHandler.flush();
}

void clearUsersOrders(['0x02bf5bdd3387ffd93474252a95b16976429707cc', '0x367b6cF125db1540F0DA0523200781d4b3147ceD']);
