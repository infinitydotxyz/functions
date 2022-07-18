import { FirestoreOrderItem, Token } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb } from '../firestore';

export function getNftRef(orderItem: Omit<FirestoreOrderItem, 'attributes'>): FirebaseFirestore.DocumentReference<Partial<Token>> {
  const db = getDb();
  const collection = orderItem.collectionAddress;
  const chainId = orderItem.chainId;
  const tokenId = orderItem.tokenId;

  const collectionDocId = `${chainId}:${collection.trim().toLowerCase()}`;
  const collectionRef = db.collection(firestoreConstants.COLLECTIONS_COLL).doc(collectionDocId);
  const nftRef = collectionRef.collection(firestoreConstants.COLLECTION_NFTS_COLL).doc(tokenId);

  return nftRef as FirebaseFirestore.DocumentReference<Partial<Token>>;
}
