import { EventType, SaleSource } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import PQueue from 'p-queue';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQueryWithRef } from '../firestore/stream-query';

const usersQueue = new PQueue({ concurrency: 1000 });

const batch = new FirestoreBatchHandler();
async function migrateRewards() {
  const db = getDb();

  const tasks = [
    deleteUserCuration,
    deleteUserRewards,
    deleteStakingContracts,
    deleteRewards,
    deleteInfinityMarketplaceStats,
    deleteCollectionCurationCollections,
    deleteInfinityContracts,
    deleteInfinitySales,
    removeInfinitySalesFromFeed,
    removeEventsFromFeed,
    deleteRaffleTickets,
    deleteRaffles,
    deleteRaffleOrdersLedger
  ];

  const taskQueue = new PQueue({ concurrency: 100 });

  const log = () => {
    console.log(
      `Task Queue: ${taskQueue.size}, Pending: ${taskQueue.pending} Users Queue: ${usersQueue.size}, Pending: ${usersQueue.pending}`
    );
  };

  const interval = setInterval(() => {
    log();
  }, 3000);

  console.log('Starting migration');
  await taskQueue.addAll(tasks.map((task) => () => task(db)));

  await batch.flush();
  console.log('Migration complete');
  clearInterval(interval);
}

void migrateRewards();

async function deleteUserRewards(db: FirebaseFirestore.Firestore) {
  const allTime = db.collectionGroup(firestoreConstants.USER_ALL_TIME_REWARDS_COLL);
  const phases = db.collectionGroup(firestoreConstants.USER_REWARD_PHASES_COLL);
  const ledger = db.collectionGroup(firestoreConstants.USER_TXN_FEE_REWARDS_LEDGER_COLL);

  const items = [allTime, phases, ledger];

  await Promise.all(
    items.map(async (item) => {
      const stream = streamQueryWithRef(item, (_, ref) => [ref], { pageSize: 300 });

      for await (const { ref } of stream) {
        await batch.deleteAsync(ref);
      }
    })
  );
}

async function deleteUserCuration(db: FirebaseFirestore.Firestore) {
  const userCuration = db.collectionGroup(firestoreConstants.USER_CURATION_COLL);

  const stream = streamQueryWithRef(userCuration, (_, ref) => [ref], { pageSize: 300 });

  for await (const { ref } of stream) {
    await batch.deleteAsync(ref);
  }
}

async function deleteStakingContracts(db: FirebaseFirestore.Firestore) {
  const ref = db.collection(firestoreConstants.STAKING_CONTRACTS_COLL);
  await recursivelyDelete(ref, batch);
}

async function deleteRaffleTickets(db: FirebaseFirestore.Firestore) {
  const raffleCollection = db.collection('raffleTickets');

  await recursivelyDelete(raffleCollection, batch);
}

async function deleteRaffleOrdersLedger(db: FirebaseFirestore.Firestore) {
  const raffleOrdersLedger = db.collectionGroup(firestoreConstants.USER_RAFFLE_ORDERS_LEDGER_COLL);
  const stream = streamQueryWithRef(raffleOrdersLedger, (_, ref) => [ref], { pageSize: 300 });

  const batch = new FirestoreBatchHandler();
  for await (const { ref } of stream) {
    await batch.deleteAsync(ref as FirebaseFirestore.DocumentReference<any>);
  }

  await batch.flush();
}

async function deleteRaffles(db: FirebaseFirestore.Firestore) {
  const raffles = db.collection('raffles');
  await recursivelyDelete(raffles, batch);
}

async function deleteRewards(db: FirebaseFirestore.Firestore) {
  const rewardsCollection = db.collection('rewards');
  await recursivelyDelete(rewardsCollection, batch);
}

async function deleteInfinityMarketplaceStats(db: FirebaseFirestore.Firestore) {
  const infinityStats = db.collection(firestoreConstants.MARKETPLACE_STATS_COLL).doc('INFINITY');

  const collections = await infinityStats.listCollections();
  for (const coll of collections) {
    await recursivelyDelete(coll, batch);
  }

  await batch.deleteAsync(infinityStats);
}

async function deleteCollectionCurationCollections(db: FirebaseFirestore.Firestore) {
  const curationCollection = db.collectionGroup(firestoreConstants.COLLECTION_CURATION_COLL);

  const stream = streamQueryWithRef(curationCollection, (_, ref) => [ref], { pageSize: 300 });

  for await (const { ref } of stream) {
    const collections = await ref.listCollections();
    for (const coll of collections) {
      await recursivelyDelete(coll, batch);
    }
    await batch.deleteAsync(ref);
  }
}

async function deleteInfinityContracts(db: FirebaseFirestore.Firestore) {
  const contractEventsRef = db.collection(firestoreConstants.CONTRACT_EVENTS);
  const infinityStakerTest = contractEventsRef.doc('1:0xbff1b5b3b9775b6a775fdc1e688d0f365b49648a');
  const infinityExchange = contractEventsRef.doc('1:0xbada5551b2f08d3959329b2ff8d0a7cc8be26324');
  const infinityStaker = contractEventsRef.doc('1:0xbada55fa5ff3850fc979455f27f0ca3f1178be55');
  await batch.deleteAsync(infinityStakerTest);
  await batch.deleteAsync(infinityExchange);
  await batch.deleteAsync(infinityStaker);
}

async function deleteInfinitySales(db: FirebaseFirestore.Firestore) {
  const sales = db.collection('sales');
  const infinitySales = sales.where('source', '==', SaleSource.Infinity);
  const stream = streamQueryWithRef(infinitySales, (_, ref) => [ref], { pageSize: 300 });

  const batch = new FirestoreBatchHandler();
  for await (const { ref } of stream) {
    await batch.deleteAsync(ref as FirebaseFirestore.DocumentReference<any>);
  }

  await batch.flush();
}

async function removeInfinitySalesFromFeed(db: FirebaseFirestore.Firestore) {
  const feed = db.collection(firestoreConstants.FEED_COLL);

  const infinitySales = feed.where('type', '==', EventType.NftSale).where('source', '==', SaleSource.Infinity);

  const stream = streamQueryWithRef(infinitySales, (_, ref) => [ref], { pageSize: 300 });

  const batch = new FirestoreBatchHandler();
  for await (const { ref } of stream) {
    await batch.deleteAsync(ref as FirebaseFirestore.DocumentReference<any>);
  }
  await batch.flush();
}

async function removeEventsFromFeed(db: FirebaseFirestore.Firestore) {
  const feed = db.collection(firestoreConstants.FEED_COLL);

  const events = [
    EventType.TokensUnStaked,
    EventType.TokensStaked,
    EventType.TokensRageQuit,
    EventType.UserVote,
    EventType.UserVoteRemoved
  ];

  for (const eventType of events) {
    const stream = streamQueryWithRef(feed.where('type', '==', eventType), (_, ref) => [ref], { pageSize: 300 });
    for await (const { ref } of stream) {
      await batch.deleteAsync(ref as FirebaseFirestore.DocumentReference<any>);
    }
    await batch.flush();
  }
}

async function recursivelyDelete(ref: FirebaseFirestore.CollectionReference<any>, batch: FirestoreBatchHandler) {
  const queue = new PQueue({
    concurrency: 1000
  });
  const results = await ref.listDocuments();
  for (const ref of results) {
    queue
      .add(async () => {
        const subCollections = await ref.listCollections();
        await Promise.all(
          subCollections.map((subCollection) => queue.add(() => recursivelyDelete(subCollection, batch)))
        );
        await batch.deleteAsync(ref);
      })
      .catch((err) => {
        console.error(err);
      });
  }

  await queue.onIdle();
  await batch.flush();
}
