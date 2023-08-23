import { Contract } from 'ethers';
import PQueue from 'p-queue';

import { ERC20ABI } from '@infinityxyz/lib/abi';
import { ChainId } from '@infinityxyz/lib/types/core';
import { getTokenAddress } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { DocRef } from '@/firestore/types';
import { getProvider } from '@/lib/utils/ethersUtils';

import { getBonusLevel } from '../bonus';
import { ReferralEvent } from '../events';
import { getReferralPoints } from '../referrals/points';
import {
  AirdropEvent,
  Referral,
  RewardsEvent,
  UserAirdropRewardEvent,
  UserRewardEvent,
  getUserReferrers,
  saveReferrals,
  saveUserRewardEvents
} from '../referrals/sdk';

export const handleReferral = async (event: ReferralEvent) => {
  const firestore = getDb();

  const existingReferrers = await getUserReferrers(firestore, event.referree, 1);
  if (existingReferrers.length > 0) {
    // the user already has a referrer
    return;
  }

  const initialReferrer = event.referrer.address;
  const referrers = await getUserReferrers(firestore, initialReferrer, 99);
  let referrals: Referral[] = referrers.map((item) => {
    return {
      user: event.referree,
      referrer: item.user,
      referrerXFLBalance: '0',
      index: item.index + 1, // initial referrer + 1 level
      blockNumber: event.blockNumber,
      timestamp: event.timestamp
    };
  });

  referrals.unshift({
    user: event.referree,
    referrer: initialReferrer,
    referrerXFLBalance: '0',
    index: 0,
    blockNumber: event.blockNumber,
    timestamp: event.timestamp
  });

  const provider = getProvider(ChainId.Mainnet);
  const contractAddress = getTokenAddress(ChainId.Mainnet);
  const contract = new Contract(contractAddress, ERC20ABI as any, provider);
  const pqueue = new PQueue({ concurrency: 5 });
  referrals = await Promise.all(
    referrals.map(async (referral) => {
      return await pqueue.add(async () => {
        const balance = await contract.balanceOf(referral.referrer, { blockTag: referral.blockNumber });
        const ref: Referral = {
          ...referral,
          referrerXFLBalance: balance.toString()
        };
        return ref;
      });
    })
  );
  const batch = firestore.batch();

  const rewards = referrals.map((item) => {
    const referralPoints = getReferralPoints(item.index);
    const bonus = getBonusLevel(item.referrerXFLBalance);
    const totalPoints = bonus.multiplier * referralPoints;
    const reward: UserRewardEvent = {
      user: item.referrer,
      kind: 'referral',
      blockNumber: item.blockNumber,
      balance: item.referrerXFLBalance,
      bonusMultiplier: bonus.multiplier,
      preBonusPoints: referralPoints,
      totalPoints,
      timestamp: Date.now(),
      processed: false
    };
    return reward;
  });
  saveReferrals(firestore, referrals, batch);
  saveUserRewardEvents(firestore, rewards, batch);
  await batch.commit();
};

const handleAirdrop = async (event: AirdropEvent) => {
  const firestore = getDb();
  const batch = firestore.batch();

  const reward: UserAirdropRewardEvent = {
    user: event.user,
    kind: 'airdrop',
    tier: event.tier,
    timestamp: Date.now(),
    processed: false
  };

  saveUserRewardEvents(firestore, [reward], batch);
  await batch.commit();
};

export async function* process(stream: AsyncGenerator<{ data: RewardsEvent; ref: DocRef<RewardsEvent> }>) {
  let numProcessed = 0;
  for await (const { data: event, ref } of stream) {
    try {
      switch (event.kind) {
        case 'REFERRAL': {
          await handleReferral(event);
          break;
        }
        case 'AIRDROP': {
          await handleAirdrop(event);
          break;
        }
        default: {
          throw new Error(`Unknown event kind ${(event as { kind: string }).kind} `);
        }
      }
      await ref.update({ processed: true });
      numProcessed += 1;
      yield { numProcessed };
    } catch (err) {
      console.error(err);
    }
  }
}
