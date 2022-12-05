import { ethers } from 'ethers';

import { ChainId } from '@infinityxyz/lib/types/core';
import { Infinity, Seaport } from '@reservoir0x/sdk';

import { Reservoir } from '@/lib/index';
import { bn } from '@/lib/utils';

import { ErrorCode } from '../../errors/error-code';
import { OrderCurrencyError, OrderDynamicError, OrderError, OrderKindError } from '../../errors/order.error';
import { OrderTransformer } from '../order-transformer.abstract';

export abstract class SeaportOrderTransformer extends OrderTransformer<Seaport.Order> {
  readonly source: 'seaport';

  protected _order: Seaport.Order;

  protected _components: Seaport.Types.OrderComponents;

  /**
   * perform order kind specific checks on the order
   */
  protected abstract _checkOrderKindValid(): void;

  constructor(
    _chainId: ChainId,
    _reservoirOrder: Reservoir.Api.Orders.Types.Order,
    _provider: ethers.providers.StaticJsonRpcProvider
  ) {
    super(_chainId, _reservoirOrder, _provider);
    this._components = this._reservoirOrder.rawData as Seaport.Types.OrderComponents;
    this._order = new Seaport.Order(this.chainId, this._components);
  }

  public get kind() {
    return this._order.params.kind;
  }

  public get maker() {
    return this._order.params.offerer;
  }

  public get startTime() {
    return this._components.startTime;
  }

  public get endTime() {
    return this._components.endTime;
  }

  public get startPrice() {
    const items = this.isSellOrder ? this._components.consideration : this._components.offer;

    const price = bn(0);

    for (const item of items) {
      price.add(bn(item.startAmount));
    }

    return price.toString();
  }

  public get endPrice() {
    const items = this.isSellOrder ? this._components.consideration : this._components.offer;

    const price = bn(0);

    for (const item of items) {
      price.add(bn(item.endAmount));
    }

    return price.toString();
  }

  public get isPrivate() {
    return false;
  }

  public _checkValid() {
    /**
     * order kind should be known
     */
    if (!this.kind) {
      throw new OrderKindError(`${this.kind}`, 'seaport', 'unexpected');
    }

    const zones = [ethers.constants.AddressZero, Seaport.Addresses.PausableZone[this.chainId]];
    if (!zones.includes(this._components.zone)) {
      throw new OrderError('unknown zone', ErrorCode.SeaportZone, this._components.zone, this.source, 'unsupported');
    }
    /**
     * conduit should be zero for now
     * - not sure what the implications are for allowing non-seaport
     * conduits
     */
    if (this._components.conduitKey !== Seaport.Addresses.OpenseaConduitKey[this.chainId]) {
      throw new OrderError(
        `invalid conduitKey`,
        ErrorCode.SeaportConduitKey,
        `${this._components.conduitKey}`,
        'seaport',
        'unsupported'
      );
    }

    this._checkOrderKindValid();
  }

  public get isERC721(): boolean {
    const items = this.isSellOrder ? this._components.offer : this._components.consideration;
    const erc721ItemTypes = new Set([Seaport.Types.ItemType.ERC721]); // don't include ERC721 with criteria
    return items.every((offerItem) => {
      return erc721ItemTypes.has(offerItem.itemType);
    });
  }

  public get currency(): string {
    const items = this.isSellOrder ? this._components.consideration : this._components.offer;

    let currency: string | undefined = undefined;
    for (const item of items) {
      if (currency && currency !== item.token) {
        throw new OrderCurrencyError(this.source, currency);
      }
      currency = item.token;
    }

    if (!currency) {
      throw new OrderCurrencyError(this.source, `${currency}`);
    }

    return currency;
  }

  public get numItems(): number {
    const items = this.nfts;

    let numItems = 0;
    for (const item of items) {
      numItems += item.tokens.length;
    }

    return numItems;
  }

  public get nfts() {
    const items = this.isSellOrder ? this._components.offer : this._components.consideration;

    const nfts: { [collection: string]: { [tokenId: string]: number } } = {};

    for (const item of items) {
      if (item.startAmount !== item.endAmount) {
        throw new OrderDynamicError(this.source);
      }
      if (item.itemType !== Seaport.Types.ItemType.ERC721) {
        throw new OrderError('non-erc721 order', ErrorCode.OrderTokenStandard, `true`, this.source);
      }

      /**
       * identifier or criteria is the token id
       * when the `itemType` is `ERC721
       */
      const tokenId = item.identifierOrCriteria;

      const quantity = parseInt(item.startAmount, 10);

      if (quantity !== 1) {
        throw new OrderError('quantity is not 1', ErrorCode.OrderTokenQuantity, `${quantity}`, this.source);
      }

      const collection = item.token;

      if (!(collection in nfts)) {
        nfts[collection] = {};
      }

      if (tokenId in nfts[collection]) {
        throw new OrderError('duplicate token id', ErrorCode.DuplicateToken, tokenId, this.source);
      } else {
        nfts[collection][tokenId] = quantity;
      }
    }

    const orderItems: Infinity.Types.OrderNFTs[] = Object.entries(nfts).map(([key, value]) => {
      const collection = key;
      const nft = {
        collection,
        tokens: [] as Infinity.Types.OrderNFTs['tokens']
      };

      for (const [tokenId, quantity] of Object.entries(value)) {
        nft.tokens.push({
          tokenId,
          numTokens: quantity
        });
      }

      return nft;
    });

    return orderItems;
  }
}
