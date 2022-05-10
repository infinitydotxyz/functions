import { Collection } from "@infinityxyz/lib/types/core";
import { firestoreConstants } from "@infinityxyz/lib/utils/constants";
import FirestoreBatchHandler from "firestore/batch-handler";

export async function updateNftsWithCollection(
  collection: Partial<Collection>,
  collectionRef: FirebaseFirestore.DocumentReference<Partial<Collection>>
): Promise<void> {
  const update = {
    collectionAddress: collection?.address ?? "",
    collectionName: collection?.metadata?.name ?? "",
    collectionSlug: collection?.slug ?? "",
    hasBlueCheck: collection?.hasBlueCheck ?? false,
  };
  const docs = await collectionRef
    .collection(firestoreConstants.COLLECTION_NFTS_COLL)
    .listDocuments();
  const batchHandler = new FirestoreBatchHandler();
  for (const doc of docs) {
    batchHandler.add(doc, update, { merge: true });
  }

  await batchHandler.flush();
}
