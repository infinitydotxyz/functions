import { TokenPair } from './token-pair.abstract';
import { TokenPairType, TokenPrice } from './types';
import { TokenPair as ITokenPair } from './token-pair.interface';

const ONE_HOUR = 60 * 60 * 1000;
export class CachedTokenPair implements ITokenPair {
  protected get ref() {
    return this._db
      .collection('tokenPools')
      .doc(
        `${this._tokenPair.token0.chainId}:${this._tokenPair.token0.address.toLowerCase()}-${
          this._tokenPair.token1.chainId
        }:${this._tokenPair.token1.address.toLowerCase()}`
      )
      .collection('poolPrices') as FirebaseFirestore.CollectionReference<TokenPrice>;
  }

  public readonly MAX_BLOCK_AGE = 100;
  public readonly MAX_AGE = ONE_HOUR;

  constructor(protected _db: FirebaseFirestore.Firestore, protected _tokenPair: TokenPair) {}

  public get tokenPair(): TokenPairType {
    return this._tokenPair.tokenPair;
  }

  public async getTokenPrice(blockNumber?: number): Promise<TokenPrice> {
    const cachedPrice = await this._getCachedTokenPrice(blockNumber);
    if (cachedPrice) {
      return cachedPrice;
    }
    const price = await this._tokenPair.getTokenPrice(blockNumber);
    await this._cacheTokenPrice(price);
    return price;
  }

  protected async _getCachedTokenPrice(blockNumber?: number): Promise<TokenPrice | null> {
    let mostRecentQuery = this.ref.orderBy('blockNumber', 'desc');
    if (typeof blockNumber === 'number' && !Number.isNaN(blockNumber)) {
      mostRecentQuery = mostRecentQuery.where('blockNumber', '<=', blockNumber);
    }
    const mostRecentSnap = await mostRecentQuery.limit(1).get();
    const mostRecentPrice = mostRecentSnap.docs[0]?.data?.();
    if (!mostRecentPrice) {
      return null;
    }
    const blockNumberExpired = blockNumber && mostRecentPrice.blockNumber < blockNumber - this.MAX_BLOCK_AGE;
    const timestampExpired =
      !blockNumber && mostRecentPrice.timestamp && mostRecentPrice.timestamp < Date.now() - this.MAX_AGE;
    if (!mostRecentPrice || blockNumberExpired || timestampExpired) {
      return null;
    }
    return mostRecentPrice;
  }

  protected async _cacheTokenPrice(price: TokenPrice): Promise<void> {
    await this.ref.add(price);
  }
}
