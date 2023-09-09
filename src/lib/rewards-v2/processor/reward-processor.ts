import { BigNumber, Contract } from 'ethers';
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
  BuyEvent,
  Referral,
  RewardsEvent,
  UserAirdropBoostEvent,
  UserAirdropRewardEvent,
  UserBuyRewardEvent,
  UserRewardEvent,
  getUserReferrers,
  saveReferrals,
  saveUserRewardEvents
} from '../referrals/sdk';

const getXFLContract = () => {
  const provider = getProvider(ChainId.Mainnet);
  const contractAddress = getTokenAddress(ChainId.Mainnet);
  const contract = new Contract(contractAddress, ERC20ABI as any, provider);
  return contract;
};

const getBalance = async (contract: Contract, user: string, options: { blockTag: number }) => {
  const balance = await contract.balanceOf(user, { blockTag: options.blockTag });
  return BigNumber.from(balance);
};

export const handleReferral = async (firestore: FirebaseFirestore.Firestore, event: ReferralEvent) => {
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

  // generate at most one referral for each user
  const users = new Set();
  referrals = referrals.filter((item) => {
    if (users.has(item.user)) {
      return false;
    }
    users.add(item.user);
    return true;
  });
  const contract = getXFLContract();
  const pqueue = new PQueue({ concurrency: 5 });
  referrals = await Promise.all(
    referrals.map(async (referral) => {
      return await pqueue.add(async () => {
        const balance = await getBalance(contract, referral.referrer, { blockTag: referral.blockNumber });
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

const handleAirdrop = (firestore: FirebaseFirestore.Firestore, event: AirdropEvent) => {
  const reward: UserAirdropRewardEvent = {
    user: event.user,
    kind: 'airdrop',
    tier: event.tier,
    timestamp: Date.now(),
    processed: false
  };

  return (batch: FirebaseFirestore.WriteBatch) => {
    saveUserRewardEvents(firestore, [reward], batch);
  };
};

const handleBuy = async (firestore: FirebaseFirestore.Firestore, event: BuyEvent) => {
  const contract = getXFLContract();
  const xflBalance = await getBalance(contract, event.user, { blockTag: event.blockNumber });
  const bonus = getBonusLevel(xflBalance);
  const nativeMultiplier = event.isNativeBuy ? 100 : 1;
  const buyPoints = event.sale.salePriceUsd * nativeMultiplier;
  const totalPoints = bonus.multiplier * buyPoints;
  const reward: UserBuyRewardEvent = {
    user: event.user,
    chainId: event.chainId,
    isNativeBuy: event.isNativeBuy,
    isNativeFill: event.isNativeFill,
    sale: {
      blockNumber: event.sale.blockNumber,
      buyer: event.sale.buyer,
      seller: event.sale.seller,
      txHash: event.sale.txHash,
      logIndex: event.sale.logIndex,
      bundleIndex: event.sale.bundleIndex,
      fillSource: event.sale.fillSource,
      washTradingScore: event.sale.washTradingScore,
      marketplace: event.sale.marketplace,
      marketplaceAddress: event.sale.marketplaceAddress,
      quantity: event.sale.quantity,
      collectionAddress: event.sale.collectionAddress,
      tokenId: event.sale.tokenId,
      saleTimestamp: event.sale.saleTimestamp,
      salePriceUsd: event.sale.salePriceUsd
    },
    kind: 'buy',
    blockNumber: event.blockNumber,
    balance: xflBalance.toString(),
    bonusMultiplier: bonus.multiplier,
    preBonusPoints: buyPoints,
    totalPoints,
    timestamp: Date.now(),
    processed: false
  };

  return (batch: FirebaseFirestore.WriteBatch) => {
    saveUserRewardEvents(firestore, [reward], batch);
  };
};

export async function* process(stream: AsyncGenerator<{ data: RewardsEvent; ref: DocRef<RewardsEvent> }>) {
  let numProcessed = 0;
  const db = getDb();
  let batch = db.batch();
  let saves = [];
  for await (const { data: event, ref } of stream) {
    try {
      switch (event.kind) {
        case 'REFERRAL': {
          await handleReferral(db, event);
          break;
        }
        case 'AIRDROP': {
          const save = handleAirdrop(db, event);
          saves.push(save);
          break;
        }
        case 'AIRDROP_BOOST': {
          const reward: UserAirdropBoostEvent = {
            user: event.user,
            kind: 'airdrop_boost',
            timestamp: Date.now(),
            processed: false
          };
          const save = (batch: FirebaseFirestore.WriteBatch) => {
            saveUserRewardEvents(db, [reward], batch);
          };
          saves.push(save);
          break;
        }
        case 'BUY': {
          const save = await handleBuy(db, event);
          saves.push(save);
          break;
        }

        default: {
          throw new Error(`Unknown event kind ${(event as { kind: string }).kind} `);
        }
      }
      batch.update(ref, { processed: true });
      numProcessed += 1;

      if (saves.length > 300) {
        for (const save of saves) {
          save(batch);
        }
        await batch.commit();
        saves = [];
        batch = db.batch();
      }
      yield { numProcessed };
    } catch (err) {
      console.error(err);
    }
  }

  if (saves.length > 0) {
    for (const save of saves) {
      save(batch);
    }
    await batch.commit();
  }
}
