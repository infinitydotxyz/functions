interface ReferralCode {
  code: string;
  address: string;
  createdAt: number;
}

export interface ReferralEvent {
  kind: "REFERRAL",
  referree: string,
  referrer: {
    code: string,
    address: string,
  },
  blockNumber: number,
  timestamp: number,
  processed: boolean,
}

export interface RewardEvent {
  user: string,
  kind: 'referral' | 'airdrop' | 'listing' | 'buy',
  blockNumber: number,
  balance: string,
  bonusMultiplier: number,
  preBonusPoints: number,
  totalPoints: number,
  timestamp: number,
  processed: boolean,
}

export interface Referral {
  user: string,
  referrer: string,
  referrerXFLBalance: string,
  kind: "primary" | "secondary" | "tertiary",
  blockNumber: number,
  timestamp: number,
}

export const getUserByReferralCode = async (firestore: FirebaseFirestore.Firestore, referralCode: string) => {
  const referralCodesRef = firestore.collection('pixl').doc('pixlReferrals').collection("pixlReferralCodes") as FirebaseFirestore.CollectionReference<ReferralCode>;
  const referralCodeRef = referralCodesRef.doc(referralCode);
  const referralSnap = await referralCodeRef.get();
  const referralCodeData = referralSnap.data();
  if (!referralCodeData) {
    return { address: null };
  }

  return {
    address: referralCodeData.address
  }
}


export const saveReferralEvent = async (firestore: FirebaseFirestore.Firestore, event: ReferralEvent) => {
  await firestore.collection("pixl").doc("pixlRewards").collection("pixlRewardEvents").doc().set(event);
}

export const saveReferrals = (firestore: FirebaseFirestore.Firestore, referrals: Referral[], batch: FirebaseFirestore.WriteBatch): void => {
  const referrralsRef = firestore.collection("pixl").doc("pixlReferrals").collection("pixlUserReferrals") as FirebaseFirestore.CollectionReference<Referral>;
  referrals.forEach(referral => {
    const referralRef = referrralsRef.doc(`${referral.user}:${referral.referrer}`);
    batch.create(referralRef, referral);
  });
}

export const saveRewards = (firestore: FirebaseFirestore.Firestore, rewards: RewardEvent[], batch: FirebaseFirestore.WriteBatch) => {
  for (const reward of rewards) {
    const kinds = [reward.kind, 'totals'];
    const docId = firestore.collection('none').doc().id;
    for (const kind of kinds) {
      const kindSpecificRewards = firestore.collection("pixl").doc("pixlRewards").collection(`pixl:${kind}:rewards`).doc(reward.user).collection(`pixl:${kind}:rewards:events`) as FirebaseFirestore.CollectionReference<RewardEvent>;
      const doc = kindSpecificRewards.doc(docId);
      batch.set(doc, reward);
    }
  }
}

export const getUserReferrers = async (firestore: FirebaseFirestore.Firestore, user: string) => {
  const userReferralsRef = firestore.collection("pixl").doc("pixlReferrals").collection("pixlUserReferrals") as FirebaseFirestore.CollectionReference<Referral>;
  const referrersQuery = userReferralsRef.where("user", "==", user);
  const referrersSnap = await referrersQuery.get();

  return referrersSnap.docs.map(doc => doc.data()).reduce((acc: Record<Referral[
    "kind"], string | null>, curr) => {
    switch (curr.kind) {
      case "primary":
        return { ...acc, primary: curr.referrer };
      case "secondary":
        return { ...acc, secondary: curr.referrer };
      case "tertiary":
        return { ...acc, tertiary: curr.referrer };
    }
  }, {
    primary: null,
    secondary: null,
    tertiary: null,
  });
}
