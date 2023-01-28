import { constants, ethers, providers } from 'ethers';

import {
  ChainId,
  ChainNFTs,
  ChainOBOrder,
  DisplayOrder,
  FirestoreDisplayOrder,
  FirestoreDisplayOrderWithError,
  OrderEvents,
  OrderItem,
  OrderItemToken,
  OrderSource,
  RawFirestoreOrder,
  RawFirestoreOrderWithError,
  RawOrder,
  RawOrderWithoutError,
  TokenStandard,
  UserDisplayData
} from '@infinityxyz/lib/types/core';
import { CollectionDto, NftDto, UserProfileDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, formatEth } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { CollRef, DocRef, DocSnap, Firestore } from '@/firestore/types';
import { AskOrder, OrderStatus } from '@/lib/reservoir/api/orders/types';
import { bn, getUserDisplayData } from '@/lib/utils';
import { GWEI } from '@/lib/utils/constants';
import { getErc721Owner } from '@/lib/utils/ethersUtils';

import { Orderbook } from '../..';
import { ErrorCode, OrderError } from '../errors';
import { ChainOBOrderHelper } from './chain-ob-order-helper';
import { GasSimulator } from './gas-simulator/gas-simulator';
import { ReservoirOrderBuilder } from './order-builder/reservoir-order-builder';

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
        const collectionOrderRef = collectionRef
          .collection('collectionV2Orders')
          .doc(this._id) as DocRef<FirestoreDisplayOrder>;

        switch (item.kind) {
          case 'single-token': {
            const tokenRef = collectionRef
              .collection('nfts')
              .doc(item.token.tokenId)
              .collection('tokenV2Orders')
              .doc(this._id) as DocRef<FirestoreDisplayOrder>;
            return [collectionOrderRef, tokenRef];
          }
          case 'token-list': {
            const tokenRefs = item.tokens.map((token) => {
              const tokenRef = collectionRef
                .collection('nfts')
                .doc(token.tokenId)
                .collection('tokenV2Orders')
                .doc(this._id) as DocRef<FirestoreDisplayOrder>;
              return tokenRef;
            });

            return [collectionOrderRef, ...tokenRefs];
          }
          case 'collection-wide': {
            const collectionWideOrderRef = collectionRef
              .collection('collectionWideV2Orders')
              .doc(this._id) as DocRef<FirestoreDisplayOrder>;
            return [collectionOrderRef, collectionWideOrderRef];
          }
          default: {
            throw new Error(`Unsupported order kind: ${(item as unknown as any)?.kind}`);
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
    txn?: FirebaseFirestore.Transaction,
    reservoirOrder?: AskOrder
  ): Promise<{ rawOrder: RawFirestoreOrder; displayOrder: FirestoreDisplayOrder; requiresSave: boolean }> {
    const getAll = txn ? txn.getAll.bind(txn)<any> : this._db.getAll.bind(this._db);

    const [rawFirestoreOrderSnap, displayOrderSnap] = (await getAll(this.rawRef, this.chainDisplayRef)) as [
      DocSnap<RawFirestoreOrder>,
      DocSnap<FirestoreDisplayOrder>
    ];

    const rawFirestoreOrder = rawFirestoreOrderSnap.data();
    if (!rawFirestoreOrderSnap.exists || !rawFirestoreOrder?.order) {
      const update = await this._build(txn, reservoirOrder);

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

  public async getGasUsage(rawOrder: RawFirestoreOrder) {
    if (rawOrder.metadata.source === 'infinity') {
      return rawOrder.order?.gasUsage ?? 0;
    }
    try {
      const factory = new Orderbook.Transformers.OrderTransformerFactory();

      if (!rawOrder.rawOrder || 'error' in rawOrder.rawOrder) {
        return rawOrder.order?.gasUsage ?? 0;
      }
      const transformer = factory.create(this._chainId, {
        kind: rawOrder.rawOrder.source,
        side: rawOrder.rawOrder.isSellOrder ? 'sell' : 'buy',
        rawData: rawOrder.rawOrder.rawOrder
      });

      const transformationResult = await transformer.transform();
      if (!transformationResult.isNative) {
        const gasUsageString = await this._gasSimulator.simulate(
          await transformationResult.getSourceTxn(Date.now(), this._gasSimulator.simulationAccount)
        );
        return parseInt(gasUsageString, 10);
      }

      return rawOrder.order?.gasUsage ?? 0;
    } catch (err) {
      console.warn(`Failed to estimate gas`, err);
      return rawOrder.order?.gasUsage ?? 0;
    }
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
    txn?: FirebaseFirestore.Transaction,
    reservoirOrder?: AskOrder
  ): Promise<{ rawOrder: RawFirestoreOrder; displayOrder: FirestoreDisplayOrder }> {
    const orderBuilder = new ReservoirOrderBuilder(this._chainId, this._gasSimulator);
    const { order, initialStatus } = await orderBuilder.buildOrder(this._id, this._isSellOrder, reservoirOrder);

    return await this.buildFromRawOrder(order, initialStatus, txn);
  }

  public async buildFromRawOrder(
    rawOrder: RawOrder,
    initialStatus?: OrderStatus,
    txn?: FirebaseFirestore.Transaction
  ): Promise<{ rawOrder: RawFirestoreOrder; displayOrder: FirestoreDisplayOrder }> {
    if ('error' in rawOrder) {
      const rawFirestoreOrder: RawFirestoreOrderWithError = {
        metadata: {
          id: this._id,
          chainId: this._chainId,
          source: rawOrder.error.source as string as OrderSource,
          updatedAt: Date.now(),
          createdAt: 0,
          hasError: true,
          processed: false
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

      let status = initialStatus;
      if (!status && rawOrder.source === 'infinity') {
        status = await this.getOrderStatus(txn, rawOrder.infinityOrder);
      } else if (!status) {
        status = await this.getOrderStatus(txn);
      }

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
        hasError: false,
        processed: false
      },
      order: rawOrder.order,
      displayOrder: displayData
    };

    return displayOrder;
  }

  protected async _getDisplayData(nfts: ChainNFTs[], maker: string, taker?: string): Promise<DisplayOrder> {
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
    const includeTaker = taker != null && taker != ethers.constants.AddressZero;

    const takerRef = includeTaker ? this._db.collection('users').doc(taker) : undefined;

    const refs = [...collectionRefs, ...tokenRefs, makerRef];

    if (includeTaker && takerRef) {
      refs.push(takerRef);
    }

    const docs = refs.length > 0 ? await this._db.getAll(...refs) : [];

    const makerSnap = docs.pop() as DocSnap<Partial<UserProfileDto>>;
    const takerSnap = includeTaker ? (docs.pop() as DocSnap<Partial<UserProfileDto>>) : undefined;

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

      const tokensWithData = await Promise.all(
        tokens.map(async (token) => {
          const data = tokenData[`${collectionKey}:${token.tokenId}`] ?? {};
          let owner = data.owner ?? data.ownerData?.address ?? '';
          let ownerData = data.ownerData;

          if (!owner) {
            try {
              owner = await getErc721Owner({
                address: collectionAddress,
                tokenId: token.tokenId,
                chainId: this._chainId
              });
            } catch (err) {
              console.error(`Failed to get owner`, err);
              owner = 'unknown'; // default to unknown to support query + update
            }
          }

          if (!ownerData && owner !== 'unknown') {
            const ref = this._db.collection('users').doc(owner) as DocRef<UserProfileDto>;
            ownerData = await getUserDisplayData(ref);
          }

          const orderItemToken: OrderItemToken = {
            tokenId: token.tokenId,
            name: data.metadata?.name ?? '',
            numTraitTypes: data.numTraitTypes ?? 0,
            image: data.metadata?.image ?? '',
            tokenStandard: data.tokenStandard ?? TokenStandard.ERC721,
            quantity: token.numTokens,
            owner: ownerData ?? {
              address: owner ?? 'unknown',
              username: '',
              profileImage: '',
              bannerImage: '',
              displayName: ''
            }
          };
          return orderItemToken;
        })
      );

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

    const makerData = makerSnap.data() ?? {};
    const takerData = includeTaker ? takerSnap?.data() ?? {} : undefined;

    const makerDisplayData: UserDisplayData = {
      address: maker,
      displayName: makerData.displayName ?? '',
      username: makerData.username ?? '',
      profileImage: makerData.profileImage ?? '',
      bannerImage: makerData.bannerImage ?? ''
    };

    const takerDisplayData: UserDisplayData | undefined = includeTaker
      ? {
          address: taker,
          displayName: takerData?.displayName ?? '',
          username: takerData?.username ?? '',
          profileImage: takerData?.profileImage ?? '',
          bannerImage: takerData?.bannerImage ?? ''
        }
      : undefined;

    switch (items.length) {
      case 0:
        throw new Error('No items in order');
      case 1:
        return {
          kind: 'single-collection',
          item: items[0],
          maker: makerDisplayData,
          taker: takerDisplayData
        };
      default:
        return {
          kind: 'multi-collection',
          items,
          maker: makerDisplayData,
          taker: takerDisplayData
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

    const owners = [
      ...new Set(
        items.flatMap((item) => {
          switch (item.kind) {
            case 'collection-wide':
              return [null];
            case 'single-token':
              return [item.token.owner.address];
            case 'token-list':
              return item.tokens.map((token) => token.owner.address);
          }
        })
      )
    ].filter((item) => item !== null && item !== 'unknown') as string[];

    if (numCollections !== 1) {
      throw new OrderError(
        'Order contains more than one collection',
        ErrorCode.NumCollections,
        numCollections.toString(),
        rawOrder.source,
        'unsupported'
      );
    }
    const collection = items[0].address;

    const order: RawFirestoreOrder = {
      metadata: {
        id: this._id,
        chainId: this._chainId,
        source: rawOrder.source,
        updatedAt: rawOrder.updatedAt,
        createdAt: rawOrder.createdAt,
        hasError: false,
        processed: false
      },
      rawOrder,
      order: {
        collection: collection, // TODO update this if multi-collection orders are supported
        isSellOrder: this._isSellOrder,
        startTime: orderHelper.startTime,
        endTime: orderHelper.endTime,
        startTimeMs: orderHelper.startTimeMs,
        endTimeMs: orderHelper.endTimeMs,
        maker: orderHelper.signer,
        owners: owners,
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

    const status = data?.data?.status;

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

    return status ?? 'inactive';
  }
}
