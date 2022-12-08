import { constants, providers } from 'ethers';

import { ChainId, ChainNFTs, ChainOBOrder, TokenStandard, UserDisplayData } from '@infinityxyz/lib/types/core';
import { CollectionDto, NftDto, UserProfileDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, formatEth } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { CollRef, DocRef, DocSnap, Firestore } from '@/firestore/types';
import { OrderStatus } from '@/lib/reservoir/api/orders/types';
import { bn } from '@/lib/utils';
import { GWEI } from '@/lib/utils/constants';

import { ChainOBOrderHelper } from './chain-ob-order-helper';
import { GasSimulator } from './gas-simulator/gas-simulator';
import { ReservoirOrderBuilder } from './order-builder/reservoir-order-builder';
import { OrderEvents } from './order-events/types';
import {
  DisplayOrder,
  FirestoreDisplayOrder,
  FirestoreDisplayOrderWithError,
  OrderItem,
  OrderItemToken,
  RawFirestoreOrder,
  RawFirestoreOrderWithError,
  RawOrder,
  RawOrderWithoutError
} from './types';

export class BaseOrder {
  get rawRef() {
    return this._db.collection('ordersV2').doc(this._id) as DocRef<RawFirestoreOrder>;
  }

  get chainDisplayRef() {
    return this._db
      .collection('ordersV2ByChain')
      .doc(this._chainId)
      .collection('chainV2Orders')
      .doc(this._id) as DocRef<FirestoreDisplayOrder>;
  }

  getDisplayRefs(order: FirestoreDisplayOrder) {
    const chainOrderRef = this.chainDisplayRef;
    const sourceOrderRef = this._db
      .collection('ordersV2BySource')
      .doc(order.metadata.source)
      .collection('sourceV2Orders')
      .doc(this._id) as DocRef<FirestoreDisplayOrder>;

    const items =
      order.displayOrder?.kind === 'single-collection' ? [order.displayOrder?.item] : order.displayOrder?.items ?? [];

    const itemOrderRefs = items
      .filter((item) => !!item)
      .flatMap((item) => {
        const collectionRef = this._db.collection('collections').doc(`${this._chainId}:${item.address}`);
        switch (item.kind) {
          case 'single-token': {
            const tokenRef = collectionRef
              .collection('nfts')
              .doc(item.token.tokenId)
              .collection('tokenV2Orders')
              .doc(this._id) as DocRef<FirestoreDisplayOrder>;
            return [tokenRef];
          }
          case 'token-list': {
            return item.tokens.map((token) => {
              const tokenRef = collectionRef
                .collection('nfts')
                .doc(token.tokenId)
                .collection('tokenV2Orders')
                .doc(this._id) as DocRef<FirestoreDisplayOrder>;
              return tokenRef;
            });
          }
          case 'collection-wide': {
            const collectionWideOrderRef = collectionRef
              .collection('collectionWideV2Orders')
              .doc(this._id) as DocRef<FirestoreDisplayOrder>;
            return [collectionWideOrderRef];
          }
          default: {
            throw new Error(`Unsupported order kind: ${(item as any)?.kind}`);
          }
        }
      });

    const maker = order?.order?.maker;
    const makerOrderRef = maker
      ? (this._db
          .collection(firestoreConstants.USERS_COLL)
          .doc(maker)
          .collection('makerV2Orders')
          .doc(this._id) as DocRef<FirestoreDisplayOrder>)
      : undefined;

    return [...itemOrderRefs, sourceOrderRef, chainOrderRef, makerOrderRef].filter((item) => !!item);
  }

  constructor(
    protected _id: string,
    protected _chainId: ChainId,
    protected _isSellOrder: boolean,
    protected _db: Firestore,
    protected _provider: providers.StaticJsonRpcProvider,
    protected _gasSimulator: GasSimulator
  ) {}

  async refresh(txn?: FirebaseFirestore.Transaction) {
    const { rawOrder, displayOrder } = await this._build(txn);

    return { rawOrder, displayOrder };
  }

  async load(
    txn?: FirebaseFirestore.Transaction
  ): Promise<{ rawOrder: RawFirestoreOrder; displayOrder: FirestoreDisplayOrder; requiresSave: boolean }> {
    const getAll = txn ? txn.getAll.bind(txn)<any> : this._db.getAll.bind(this._db);

    const [rawFirestoreOrderSnap, displayOrderSnap] = (await getAll(this.rawRef, this.chainDisplayRef)) as [
      DocSnap<RawFirestoreOrder>,
      DocSnap<FirestoreDisplayOrder>
    ];

    const rawFirestoreOrder = rawFirestoreOrderSnap.data();
    if (!rawFirestoreOrderSnap.exists || !rawFirestoreOrder?.order) {
      const update = await this._build(txn);

      return {
        rawOrder: update.rawOrder,
        displayOrder: update.displayOrder,
        requiresSave: true
      };
    }

    const displayOrder = displayOrderSnap.data();
    if (!displayOrderSnap.exists || !displayOrder) {
      if ('error' in rawFirestoreOrder) {
        return {
          rawOrder: rawFirestoreOrder,
          displayOrder: {
            metadata: rawFirestoreOrder.metadata,
            order: rawFirestoreOrder.order,
            error: rawFirestoreOrder.error
          },
          requiresSave: true
        };
      }

      const infinityOrder = rawFirestoreOrder.rawOrder.infinityOrder;
      const displayData = await this._getDisplayData(infinityOrder.nfts, rawFirestoreOrder.order.maker);
      const displayOrder = this._getDisplayOrder(rawFirestoreOrder, displayData);

      return {
        rawOrder: rawFirestoreOrder,
        displayOrder,
        requiresSave: true
      };
    }

    return {
      rawOrder: rawFirestoreOrder,
      displayOrder,
      requiresSave: false
    };
  }

  public async save(
    rawOrder: RawFirestoreOrder,
    displayOrder: FirestoreDisplayOrder,
    txn?: FirebaseFirestore.Transaction
  ) {
    const refs = this.getDisplayRefs(displayOrder);
    if (txn) {
      txn.set(this.rawRef, rawOrder);

      for (const ref of refs) {
        if (ref) {
          txn.set(ref, displayOrder);
        }
      }
    } else {
      const batch = new BatchHandler();
      await batch.addAsync(this.rawRef, rawOrder, { merge: true });
      for (const ref of refs) {
        if (ref) {
          await batch.addAsync(ref, displayOrder, { merge: true });
        }
      }
      await batch.flush();
    }
  }

  protected async _build(
    txn?: FirebaseFirestore.Transaction
  ): Promise<{ rawOrder: RawFirestoreOrder; displayOrder: FirestoreDisplayOrder }> {
    const orderBuilder = new ReservoirOrderBuilder(this._chainId, this._gasSimulator);
    const result = await orderBuilder.buildOrder(this._id, this._isSellOrder);

    return await this.buildFromRawOrder(result, txn);
  }

  public async buildFromRawOrder(
    rawOrder: RawOrder,
    txn?: FirebaseFirestore.Transaction
  ): Promise<{ rawOrder: RawFirestoreOrder; displayOrder: FirestoreDisplayOrder }> {
    if ('error' in rawOrder) {
      const rawFirestoreOrder: RawFirestoreOrderWithError = {
        metadata: {
          id: this._id,
          chainId: this._chainId,
          source: rawOrder.error.source as any,
          updatedAt: Date.now(),
          createdAt: 0,
          hasError: true
        },
        error: rawOrder.error
      };

      const displayOrder: FirestoreDisplayOrderWithError = {
        ...rawFirestoreOrder
      };

      return { rawOrder: rawFirestoreOrder, displayOrder };
    } else {
      /**
       * TODO how do we handle the maker as the match executor?
       */
      const displayData = await this._getDisplayData(rawOrder.infinityOrder.nfts, rawOrder.infinityOrder.signer);
      const status = await this.getOrderStatus(
        txn,
        rawOrder.source === 'infinity' ? rawOrder.infinityOrder : undefined
      );
      const rawFirestoreOrder = this._getRawFirestoreOrder(rawOrder, displayData, status);
      const displayOrder = this._getDisplayOrder(rawFirestoreOrder, displayData);
      return {
        rawOrder: rawFirestoreOrder,
        displayOrder
      };
    }
  }

  protected _getDisplayOrder(rawOrder: RawFirestoreOrder, displayData: DisplayOrder): FirestoreDisplayOrder {
    if ('error' in rawOrder) {
      return {
        metadata: {
          ...rawOrder.metadata
        },
        order: rawOrder.order,
        error: rawOrder.error
      };
    }
    const displayOrder: FirestoreDisplayOrder = {
      metadata: {
        id: rawOrder.metadata.id,
        chainId: rawOrder.metadata.chainId,
        source: rawOrder.metadata.source,
        updatedAt: rawOrder.metadata.updatedAt,
        createdAt: rawOrder.metadata.createdAt,
        hasError: false
      },
      order: rawOrder.order,
      displayOrder: displayData
    };

    return displayOrder;
  }

  protected async _getDisplayData(nfts: ChainNFTs[], maker: string): Promise<DisplayOrder> {
    const collectionRefs = nfts.map((nft) => {
      return this._db.collection('collections').doc(`${this._chainId}:${nft.collection}`);
    });

    const tokenRefs = nfts.flatMap((nft) => {
      return nft.tokens.map((token) => {
        return this._db
          .collection('collections')
          .doc(`${this._chainId}:${nft.collection}`)
          .collection('nfts')
          .doc(token.tokenId);
      });
    });

    const makerRef = this._db.collection('users').doc(maker);

    const refs = [...collectionRefs, ...tokenRefs, makerRef];

    const docs = await this._db.getAll(...refs);

    const makerDoc = docs.pop() as DocSnap<Partial<UserProfileDto>>;
    const collectionDocs = docs.slice(0, collectionRefs.length) as DocSnap<Partial<CollectionDto>>[];
    const tokenDocs = docs.slice(collectionRefs.length) as DocSnap<Partial<NftDto>>[];

    const collectionData = Object.fromEntries(
      collectionDocs.map((doc) => [doc.id, doc.data() ?? ({} as Partial<CollectionDto>)])
    );

    const tokenData = Object.fromEntries(
      tokenDocs.map((doc) => [`${doc.ref.parent.parent?.id}:${doc.id}`, doc.data() ?? {}])
    );

    const items: OrderItem[] = [];
    for (const { collection: collectionAddress, tokens } of nfts) {
      let item: OrderItem;
      const collectionKey = `${this._chainId}:${collectionAddress}`;
      const collection = collectionData[collectionKey];
      const tokensWithData = tokens.map((token) => {
        const data = tokenData[`${collectionKey}:${token.tokenId}`] ?? {};
        const orderItemToken: OrderItemToken = {
          tokenId: token.tokenId,
          name: data.metadata?.name ?? '',
          numTraitTypes: data.numTraitTypes ?? 0,
          image: data.metadata?.image ?? '',
          tokenStandard: data.tokenStandard ?? TokenStandard.ERC721,
          quantity: token.numTokens
        };
        return orderItemToken;
      });

      switch (tokens.length) {
        case 0:
          item = {
            kind: 'collection-wide',
            chainId: this._chainId,
            address: collectionAddress,
            hasBlueCheck: collection.hasBlueCheck ?? false,
            slug: collection.slug ?? '',
            name: collection.metadata?.name ?? '',
            profileImage: collection.metadata?.profileImage ?? '',
            bannerImage: collection.metadata?.bannerImage ?? '',
            tokenStandard: collection.tokenStandard ?? TokenStandard.ERC721
          };
          break;
        case 1:
          item = {
            kind: 'single-token',
            chainId: this._chainId,
            address: collectionAddress,
            hasBlueCheck: collection.hasBlueCheck ?? false,
            slug: collection.slug ?? '',
            name: collection.metadata?.name ?? '',
            profileImage: collection.metadata?.profileImage ?? '',
            bannerImage: collection.metadata?.bannerImage ?? '',
            tokenStandard: collection.tokenStandard ?? TokenStandard.ERC721,
            token: tokensWithData[0]
          };
          break;
        default:
          item = {
            kind: 'token-list',
            chainId: this._chainId,
            address: collectionAddress,
            hasBlueCheck: collection.hasBlueCheck ?? false,
            slug: collection.slug ?? '',
            name: collection.metadata?.name ?? '',
            profileImage: collection.metadata?.profileImage ?? '',
            bannerImage: collection.metadata?.bannerImage ?? '',
            tokenStandard: collection.tokenStandard ?? TokenStandard.ERC721,
            tokens: tokensWithData
          };
      }

      items.push(item);
    }

    const makerData = makerDoc.data() ?? {};
    const makerDisplayData: UserDisplayData = {
      address: maker,
      displayName: makerData.displayName ?? '',
      username: makerData.username ?? '',
      profileImage: makerData.profileImage ?? '',
      bannerImage: makerData.bannerImage ?? ''
    };

    switch (items.length) {
      case 0:
        throw new Error('No items in order');
      case 1:
        return {
          kind: 'single-collection',
          item: items[0],
          maker: makerDisplayData
        };
      default:
        return {
          kind: 'multi-collection',
          items,
          maker: makerDisplayData
        };
    }
  }

  protected _getRawFirestoreOrder(
    rawOrder: RawOrderWithoutError,
    displayOrder: DisplayOrder,
    status: OrderStatus
  ): RawFirestoreOrder {
    const orderHelper = new ChainOBOrderHelper(this._chainId, rawOrder.infinityOrder);
    const numCollections = orderHelper.nfts.length;
    const numTokens = orderHelper.nfts.reduce((acc, nft) => acc + nft.tokens.length, 0);
    const totalTokenQuantity = orderHelper.nfts.reduce(
      (acc, nft) => acc + nft.tokens.reduce((acc, token) => acc + token.numTokens, 0),
      0
    );

    const items = 'item' in displayOrder ? [displayOrder.item] : displayOrder.items;
    const hasBlueCheck = items.every((item) => item.hasBlueCheck === true);

    const order: RawFirestoreOrder = {
      metadata: {
        id: this._id,
        chainId: this._chainId,
        source: rawOrder.source,
        updatedAt: rawOrder.updatedAt,
        createdAt: rawOrder.createdAt,
        hasError: false
      },
      rawOrder,
      order: {
        isSellOrder: this._isSellOrder,
        startTime: orderHelper.startTime,
        endTime: orderHelper.endTime,
        startTimeMs: orderHelper.startTimeMs,
        endTimeMs: orderHelper.endTimeMs,
        maker: orderHelper.signer,
        taker: constants.AddressZero, // TODO update this if private orders are supported
        numItems: orderHelper.numItems,
        currency: orderHelper.currency,
        startPrice: orderHelper.startPrice,
        endPrice: orderHelper.endPrice,
        startPriceEth: orderHelper.startPriceEth,
        endPriceEth: orderHelper.endPriceEth,
        startPricePerItem: bn(orderHelper.startPrice).div(orderHelper.numItems).toString(),
        endPricePerItem: bn(orderHelper.endPrice).div(orderHelper.numItems).toString(),
        startPricePerItemEth: orderHelper.startPriceEth / orderHelper.numItems,
        endPricePerItemEth: orderHelper.endPriceEth / orderHelper.numItems,
        gasUsageString: rawOrder.gasUsage,
        gasUsage: parseInt(rawOrder.gasUsage, 10),
        nonce: orderHelper.nonce,
        maxGasPrice: orderHelper.maxGasPrice,
        maxGasPriceGwei: bn(orderHelper.maxGasPrice).div(GWEI).toNumber(),
        maxGasPriceEth: formatEth(orderHelper.maxGasPrice, 6),
        complication: orderHelper.complication,
        sourceMarketplace: rawOrder.source,
        orderKind: {
          collectionKind: displayOrder.kind,
          numItems: orderHelper.numItems,
          numCollections,
          numTokens,
          isSubSetOrder: totalTokenQuantity !== orderHelper.numItems,
          isDynamic: orderHelper.startPrice !== orderHelper.endPrice,
          isPrivate: false // TODO update this if private orders are supported
        },
        hasBlueCheck,
        status,
        isValid: status === 'active' || status === 'inactive'
      }
    };

    return order;
  }

  public async getOrderStatus(txn?: FirebaseFirestore.Transaction, chainOBOrder?: ChainOBOrder): Promise<OrderStatus> {
    const orderEvents = this.rawRef.collection('orderEvents') as CollRef<OrderEvents>;
    const query = orderEvents.orderBy('metadata.timestamp', 'desc').limit(1);

    let result;
    if (txn) {
      result = await txn.get(query);
    } else {
      result = await query.get();
    }

    const data = result.docs?.[0]?.data?.() ?? {};

    const status = data?.data?.status ?? 'inactive';

    if (!status && !!chainOBOrder) {
      const orderHelper = new ChainOBOrderHelper(this._chainId, chainOBOrder);

      try {
        await orderHelper.checkFillability(this._provider);
        return 'active';
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === 'not-fillable') {
            return 'inactive';
          } else if (err.message === 'no-balance') {
            return 'inactive';
          } else if (err.message === 'no-approval') {
            return 'inactive';
          }
        }
      }
      return 'inactive';
    }

    return status;
  }
}
