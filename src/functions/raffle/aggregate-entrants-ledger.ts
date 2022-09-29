import {
  ChainId,
  EntrantLedgerItem,
  EntrantLedgerItemVariant,
  EntrantOrderItem,
  UserDisplayData
} from '@infinityxyz/lib/types/core';
import { UserProfileDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { paginatedTransaction } from '../../firestore/paginated-transaction';
import { RaffleType } from '../../rewards/trading-fee-program-handlers/raffle-handler';
import { RaffleEntrant, UserRaffle, UserRaffleConfig } from './types';

export async function aggregateEntrantsLedger(entrantRef: FirebaseFirestore.DocumentReference<RaffleEntrant>) {
  const db = entrantRef.firestore;

  const entrantLedgerRef = entrantRef.collection('raffleEntrantLedger');

  const raffleRef = entrantRef.parent.parent as FirebaseFirestore.DocumentReference<UserRaffle>;
  const raffleSnap = await raffleRef.get();
  const raffle = raffleSnap.data();

  if (raffle?.type !== RaffleType.User) {
    throw new Error(`Unknown raffle type ${raffle?.type}`);
  }

  const userSnap = await (
    db
      .collection(firestoreConstants.USERS_COLL)
      .doc(entrantRef.id) as FirebaseFirestore.DocumentReference<UserProfileDto>
  ).get();
  const userData = userSnap.data();
  const entrantDisplayData: UserDisplayData = {
    address: entrantRef.id,
    username: userData?.username ?? '',
    displayName: userData?.displayName ?? '',
    profileImage: userData?.profileImage ?? '',
    bannerImage: userData?.bannerImage ?? ''
  };

  const unaggregatedEventsQuery = entrantLedgerRef
    .where('isAggregated', '==', false)
    .orderBy('updatedAt', 'asc') as FirebaseFirestore.Query<EntrantLedgerItem>;
  const res = await paginatedTransaction(
    unaggregatedEventsQuery,
    db,
    { pageSize: 300, maxPages: 10 },
    async ({ data, txn, hasNextPage }) => {
      const entrantSnap = await txn.get(entrantRef);
      let events = data.docs.map((item) => ({ data: item.data(), ref: item.ref }));

      const defaultEntrant: RaffleEntrant = {
        raffleId: raffle?.id ?? '',
        numTickets: 0,
        raffleType: RaffleType.User,
        chainId: raffle?.chainId ?? ChainId.Mainnet,
        entrantAddress: entrantDisplayData.address,
        stakerContractAddress: raffle?.stakerContractAddress ?? '',
        updatedAt: Date.now(),
        isFinalized: false,
        isAggregated: false,
        entrant: entrantDisplayData,
        data: {
          volumeUSDC: 0,
          numValidOffers: 0,
          numValidListings: 0,
          numTicketsFromListings: 0,
          numTicketsFromOffers: 0,
          numTicketsFromVolume: 0
        },
        isLedgerAggregated: false
      };

      let entrant: RaffleEntrant = entrantSnap.data() ?? defaultEntrant;

      entrant = {
        ...defaultEntrant,
        ...entrant
      }

      if (entrant.isFinalized) {
        throw new Error('Entrant has been finalized. Cannot continue to update entrant');
      }

      const txnStatsEvent = events.find(
        (item) => item.data.discriminator === EntrantLedgerItemVariant.TransactionStats
      );
      if (txnStatsEvent) {
        const query = entrantLedgerRef.where(
          'discriminator',
          '==',
          EntrantLedgerItemVariant.TransactionStats
        ) as FirebaseFirestore.Query<EntrantLedgerItem>;
        const txnStatsEventsSnap = await txn.get(query);
        const txnStatsEvents = txnStatsEventsSnap.docs.map((item) => ({ data: item.data(), ref: item.ref }));
        events = events.filter((item) => item.data.discriminator === EntrantLedgerItemVariant.TransactionStats);
        events = [...events, ...txnStatsEvents];
        entrant.data.volumeUSDC = 0; // reset volume since we must sum across all applicable phases
      }

      applyEventsToEntrant(entrant, events, raffle.config);

      for (const event of events) {
        txn.set(event.ref, { isAggregated: true, updatedAt: Date.now() }, { merge: true });
      }
      txn.set(
        entrantRef,
        { ...entrant, isAggregated: false, isLedgerAggregated: !hasNextPage, updatedAt: Date.now() },
        { merge: true }
      );
    }
  );

  if (res.queryEmpty) {
    await entrantRef.set({ isLedgerAggregated: true, updatedAt: Date.now() }, { merge: true });
  }
}

export function applyEventsToEntrant(
  entrant: RaffleEntrant,
  events: { data: EntrantLedgerItem; ref: FirebaseFirestore.DocumentReference<EntrantLedgerItem> }[],
  config: UserRaffleConfig
) {
  for (const event of events) {
    switch (event.data.discriminator) {
      case EntrantLedgerItemVariant.TransactionStats:
        entrant.data.volumeUSDC += event.data.volumeUSDC;
        entrant.data.numTicketsFromVolume = entrant.data.volumeUSDC;
        break;
      case EntrantLedgerItemVariant.Offer: {
        const validOffers = [...event.data.order.items].filter((item) => {
          return !item.isSellOrder && offerAppliesToRaffle(item, config);
        });
        const stakeLevel = event.data.stakeLevel;
        if (stakeLevel > 0) {
          const numOffers = Math.max(validOffers.length, event.data.order.numItems);
          entrant.data.numValidOffers += numOffers;
          const numTickets = numOffers * stakeLevel * config.listing.ticketMultiplier;
          entrant.data.numTicketsFromListings = numTickets;
        }
        break;
      }
      case EntrantLedgerItemVariant.Listing: {
        const validListings = event.data.order.items.filter((item) => {
          return item.isSellOrder && listingAppliesToRaffle(item, config);
        });
        const stakeLevel = event.data.stakeLevel;
        if (stakeLevel > 0) {
          const numListings = Math.max(validListings.length, event.data.order.numItems);
          entrant.data.numValidOffers += numListings;
          const numTickets = numListings * stakeLevel * config.offer.ticketMultiplier;
          entrant.data.numTicketsFromOffers = numTickets;
        }
        break;
      }
    }
    event.data.isAggregated = true;
  }
  entrant.numTickets = Math.floor(
    entrant.data.numTicketsFromListings + entrant.data.numTicketsFromOffers + entrant.data.numTicketsFromVolume);
}

export function listingAppliesToRaffle(listing: EntrantOrderItem, config: UserRaffleConfig) {
  if (!listing.isSellOrder) {
    throw new Error('Item is not a listing');
  }

  if (listing.floorPriceEth == null) {
    return false;
  }

  const maxListingPrice = listing.floorPriceEth * (config.listing.maxPercentAboveFloor / 100) + listing.floorPriceEth;

  const durationValid = listing.endTimeMs - listing.startTimeMs > config.listing.minTimeValid;
  const startPriceValid = listing.startPriceEth / listing.numTokens <= maxListingPrice;
  const endPriceValid = listing.endPriceEth / listing.numTokens <= maxListingPrice;

  return listing.isTopCollection && durationValid && startPriceValid && endPriceValid;
}

export function offerAppliesToRaffle(offer: EntrantOrderItem, config: UserRaffleConfig) {
  if (offer.isSellOrder) {
    throw new Error('Item is not an offer');
  }

  if (offer.floorPriceEth == null) {
    return false;
  }

  const minOfferPrice = offer.floorPriceEth * (config.offer.maxPercentBelowFloor / 100) + offer.floorPriceEth;

  const durationValid = offer.endTimeMs - offer.startTimeMs > config.offer.minTimeValid;
  const startPriceValid = offer.startPriceEth / offer.numTokens >= minOfferPrice;
  const endPriceValid = offer.endPriceEth / offer.numTokens >= minOfferPrice;

  return offer.isTopCollection && durationValid && startPriceValid && endPriceValid;
}
