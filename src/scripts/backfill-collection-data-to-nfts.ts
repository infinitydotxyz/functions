import {
  Collection,
  OrderDirection,
  Token,
} from "@infinityxyz/lib/types/core";
import { firestoreConstants } from "@infinityxyz/lib/utils/constants";
import { getDb } from "firestore";
import { streamQuery } from "firestore/stream-query";
import PQueue from "p-queue";
import { updateNftsWithCollection } from "syncNftCollectionData/update-nfts-with-collection";

export async function backfillCollectionDataToNfts(): Promise<void> {
  const db = getDb();

  const query = db
    .collection(firestoreConstants.COLLECTIONS_COLL)
    .orderBy(
      "__name__",
      OrderDirection.Ascending
    ) as FirebaseFirestore.Query<Collection>;

  const startAfter = (collection: Collection, ref: FirebaseFirestore.DocumentReference) => {
    return [ref.id];
  };

  const pageSize = 10;
  const collectionsStream = streamQuery(query, startAfter, { pageSize });
  const queue = new PQueue({ concurrency: pageSize });

  for await (const collection of collectionsStream) {
    void queue
      .add(async () => {
        const collectionRef = db
          .collection(firestoreConstants.COLLECTIONS_COLL)
          .doc(`${collection.chainId}:${collection.address}`);
        const nftsQuery = collectionRef.collection(
          firestoreConstants.COLLECTION_NFTS_COLL
        ) as FirebaseFirestore.CollectionReference<Partial<Token>>;

        // this should be the last nft that gets updated
        const sampleNft = await nftsQuery
          .orderBy("tokenId", OrderDirection.Descending)
          .limit(1)
          .get(); 
          
        const nft = sampleNft.docs.map((item) => item.data())?.[0] as
          | (Partial<Token> & {
              collectionAddress?: string;
              collectionName?: string;
              collectionSlug?: string;
              hasBlueCheck?: boolean;
            })
          | undefined;

        const addressRequiresUpdate =
          collection?.address && nft?.collectionAddress !== collection.address;
        const slugRequiresUpdate =
          collection?.slug && nft?.collectionSlug !== collection.slug;
        const nameRequiresUpdate =
          collection?.metadata?.name !== nft?.collectionName;
        const hasBlueCheckRequiresUpdate = collection?.hasBlueCheck !== nft?.hasBlueCheck;

        if (addressRequiresUpdate || slugRequiresUpdate || nameRequiresUpdate || hasBlueCheckRequiresUpdate) {
          if (collection) {
            console.log(
              `Updating collection nfts ${collection.metadata?.name}. ${collection.address}`
            );
            await updateNftsWithCollection(collection, collectionRef);
          } 
        } else {
            console.log(`Collection: ${collection.metadata?.name} is up to date`);
        }
      })
      .catch(console.error);
    if (queue.pending === pageSize) {
      console.log(`Waiting for queue to drain...`);
      await queue.onIdle();
      console.log(`Queue drained.`);
    }
  }
}

void backfillCollectionDataToNfts();
