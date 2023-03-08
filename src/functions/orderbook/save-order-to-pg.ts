import { constants } from 'ethers';



import { FirestoreDisplayOrderWithoutError, PostgresOrder, RawFirestoreOrderWithoutError } from '@infinityxyz/lib/types/core';



import { config } from '@/config/index';
import { getMarketplaceAddress } from '@/lib/utils/get-marketplace-address';


export const saveOrdersBatchToPG = async (pgOrders: PostgresOrder[]) => {
  const pg = config.pg.getPG();
  if (pg) {
    const { pgDB, pgp } = pg;
    const table = 'eth_nft_orders';
    const columnSet = new pgp.helpers.ColumnSet(Object.keys(pgOrders[0]), { table });
    const insert = pgp.helpers.insert(pgOrders, columnSet);
    // on conflict update order status
    const query = `${insert} ON CONFLICT ON CONSTRAINT eth_nft_orders_pkey DO UPDATE SET status = EXCLUDED.status, gas_usage = EXCLUDED.gas_usage`;

    await pgDB.none(query);
  }
};

export const getPGOrder = (
  order: RawFirestoreOrderWithoutError,
  displayOrder: FirestoreDisplayOrderWithoutError
): PostgresOrder => {
  let tokenId: string;
  let tokenImage: string;
  let collectionName: string;
  let collectionImage: string;
  if (displayOrder.displayOrder.kind === 'single-collection') {
    switch (displayOrder.displayOrder.item.kind) {
      case 'collection-wide': {
        tokenId = '';
        tokenImage = displayOrder.displayOrder.item.profileImage;
        collectionImage = displayOrder.displayOrder.item.profileImage;
        collectionName = displayOrder.displayOrder.item.name;
        break;
      }
      case 'single-token': {
        tokenId = displayOrder.displayOrder.item.token.tokenId;
        tokenImage = displayOrder.displayOrder.item.token.image;
        collectionImage = displayOrder.displayOrder.item.profileImage;
        collectionName = displayOrder.displayOrder.item.name;
        break;
      }
      default:
        // future-todo: support complex orders
        throw new Error(`Received unsupported order item kind`);
    }
  } else {
    // future-todo: support complex orders
    throw new Error(`Received unsupported order kind`);
  }

  const pgOrder: PostgresOrder = {
    id: order.metadata.id,
    is_sell_order: order.order.isSellOrder,
    price_eth: order.order.startPriceEth,
    gas_usage: order.rawOrder.gasUsage,
    collection_address: order.order.collection,
    token_id: tokenId,
    token_image: tokenImage,
    collection_name: collectionName,
    collection_image: collectionImage,
    start_time_millis: order.order.startTimeMs,
    end_time_millis: order.order.endTimeMs,
    maker: order.order.maker,
    marketplace: order.metadata.source,
    marketplace_address: getMarketplaceAddress(order.metadata.chainId, order.metadata.source),
    is_private: order.order.taker !== '' && order.order.taker !== constants.AddressZero,
    is_complex: false, // future-todo: support complex orders
    status: order.order.status
  };
  return pgOrder;
};

export const saveOrderToPG = async (
  order: RawFirestoreOrderWithoutError,
  displayOrder: FirestoreDisplayOrderWithoutError
) => {
  const pg = config.pg.getPG();
  if (pg) {
    const { pgDB, pgp } = pg;
    const table = 'eth_nft_orders';
    const pgOrder = getPGOrder(order, displayOrder);
    const columnSet = new pgp.helpers.ColumnSet(Object.keys(pgOrder), { table });
    const insert = pgp.helpers.insert(pgOrder, columnSet);
    // on conflict update order status
    const query = `${insert} ON CONFLICT ON CONSTRAINT eth_nft_orders_pkey DO UPDATE SET status = EXCLUDED.status, gas_usage = EXCLUDED.gas_usage`;

    await pgDB.none(query);
  }
};