import { AssetReferralDoc, ChainId } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

export async function getSaleReferral(
  db: FirebaseFirestore.Firestore,
  buyer: string,
  asset: { collection: string; tokenId: string; chainId: ChainId },
): Promise<AssetReferralDoc | null> {
  const userRef = db.collection(firestoreConstants.USERS_COLL).doc(buyer);
  const referralsRef = userRef
    .collection(firestoreConstants.REFERRALS_COLL)
    .doc(asset.chainId)
    .collection(firestoreConstants.ASSET_REFERRALS_COLL);
  const collectionAssetDocId = `${asset.chainId}:${asset.collection}`;
  const tokenAssetDocId = asset.tokenId ? `${collectionAssetDocId}:${asset.tokenId}` : null;

  const collectionAssetRef = referralsRef.doc(
    collectionAssetDocId
  ) as FirebaseFirestore.DocumentReference<AssetReferralDoc>;
  const tokenAssetRef = tokenAssetDocId
    ? (referralsRef.doc(tokenAssetDocId) as FirebaseFirestore.DocumentReference<AssetReferralDoc>)
    : null;

  // prefer token asset referral
  const refs = [tokenAssetRef, collectionAssetRef].filter(
    (item) => !!item
  ) as FirebaseFirestore.DocumentReference<AssetReferralDoc>[];

  if (refs.length === 0) {
    return null;
  }

  const snaps = (await db.getAll(...refs)) as FirebaseFirestore.DocumentSnapshot<AssetReferralDoc>[];

  const referral = snaps.find((snap) => snap.exists)?.data();

  if (referral && referral.referrer) {
    return referral;
  }

  return null;
}
