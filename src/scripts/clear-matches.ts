import { FirestoreOrderMatch } from "@infinityxyz/lib/types/core/OBOrder";
import { firestoreConstants } from "@infinityxyz/lib/utils";
import { getDb } from "../firestore";
import FirestoreBatchHandler from "../firestore/batch-handler";


export async function clearMatches() {
    const db = getDb();

    const stream = db.collection(firestoreConstants.ORDER_MATCHES_COLL).stream() as AsyncIterable<FirebaseFirestore.DocumentSnapshot<FirestoreOrderMatch>>;

    const batchHandler = new FirestoreBatchHandler();
    for await(const item of stream) {
        batchHandler.delete(item.ref)
    }

    await batchHandler.flush();
}

void clearMatches();