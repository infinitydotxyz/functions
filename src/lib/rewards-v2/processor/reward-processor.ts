import { getDb } from "@/firestore/db";
import { DocRef } from "@/firestore/types";
import { getProvider } from "@/lib/utils/ethersUtils";
import { ERC20ABI } from "@infinityxyz/lib/abi";
import { ChainId } from "@infinityxyz/lib/types/core";
import { getTokenAddress } from "@infinityxyz/lib/utils";
import { Contract } from "ethers";
import { getBonusLevel } from "../bonus";
import { ReferralEvent, RewardsV2Events } from "../events";
import { calcReferralPoints, getReferralPoints } from "../referrals/points";
import { getUserReferrers, Referral, saveReferrals, saveUserRewardEvents, UserRewardEvent } from "../referrals/sdk";

export const handleReferral = async (event: ReferralEvent) => {
  const firestore = getDb();

  const existingReferrers = await getUserReferrers(firestore, event.referree);
  if (existingReferrers.primary) {
    // the user already has a referrer
    return;
  }

  const primaryReferrer = event.referrer.address;
  const primaryReferrerReferrers = await getUserReferrers(firestore, primaryReferrer);
  const secondaryReferrer = primaryReferrerReferrers.primary;
  const tertiaryReferrer = primaryReferrerReferrers.secondary;

  let referrals: Referral[] = [];

  const primaryReferral: Referral = {
    user: event.referree,
    referrer: primaryReferrer,
    referrerXFLBalance: "0",
    kind: "primary",
    blockNumber: event.blockNumber,
    timestamp: event.timestamp,
  };
  referrals.push(primaryReferral);

  if (secondaryReferrer) {
    const secondaryReferral: Referral = {
      user: event.referree,
      referrer: secondaryReferrer,
      referrerXFLBalance: "0",
      kind: "secondary",
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
    };
    referrals.push(secondaryReferral);
  }

  if (tertiaryReferrer) {
    const tertiaryReferral: Referral = {
      user: event.referree,
      referrer: tertiaryReferrer,
      referrerXFLBalance: "0",
      kind: "tertiary",
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
    };
    referrals.push(tertiaryReferral);
  }


  const provider = getProvider(ChainId.Mainnet);
  const contractAddress = getTokenAddress(ChainId.Mainnet);
  const contract = new Contract(contractAddress, ERC20ABI as any, provider);
  referrals = await Promise.all(referrals.map(async (referral) => {
    const balance = await contract.balanceOf(referral.referrer, { blockTag: referral.blockNumber });
    const ref: Referral = {
      ...referral,
      referrerXFLBalance: balance.toString(),
    };
    return ref;
  }));
  const batch = firestore.batch();

  const rewards = referrals.map((item) => {
    const referralPoints = getReferralPoints(item.kind);
    const bonus = getBonusLevel(item.referrerXFLBalance);
    const preBonusPoints = calcReferralPoints(referralPoints);
    const totalPoints = bonus.multiplier * preBonusPoints;
    const reward: UserRewardEvent = {
      user: item.referrer,
      kind: 'referral',
      blockNumber: item.blockNumber,
      balance: item.referrerXFLBalance,
      bonusMultiplier: bonus.multiplier,
      preBonusPoints,
      totalPoints,
      timestamp: Date.now(),
      processed: false,
    };
    return reward;
  });
  saveReferrals(firestore, referrals, batch);
  saveUserRewardEvents(firestore, rewards, batch);
  await batch.commit();
}

export const process = async (stream: AsyncGenerator<{ event: RewardsV2Events, ref: DocRef<RewardsV2Events> }>) => {
  for await (const { event, ref } of stream) {
    try {
      switch (event.kind) {
        case "REFERRAL": {
          await handleReferral(event);
          break;
        }
        default: {
          throw new Error(`Unknown event kind ${event.kind}`)
        }
      }
      await ref.update({ processed: true });
    } catch (err) {
      console.error(err);
    }
  }
}
