import { constants } from 'ethers';

import { OrderSource } from '@infinityxyz/lib/types/core';
import * as Sdk from '@reservoir0x/sdk';

export const getMarketplaceAddress = (chainId: string, orderKind?: OrderSource) => {
  const chainIdInt = parseInt(chainId, 10);
  switch (orderKind) {
    case 'blur':
      return Sdk.Blur.Addresses.Exchange[chainIdInt];
    case 'cryptopunks':
      return Sdk.CryptoPunks.Addresses.Exchange[chainIdInt];
    case 'element-erc1155':
    case 'element-erc721':
      return Sdk.Element.Addresses.Exchange[chainIdInt];

    case 'flow':
      return Sdk.Flow.Addresses.Exchange[chainIdInt];

    case 'foundation':
      return Sdk.Foundation.Addresses.Exchange[chainIdInt];

    case 'looks-rare':
      return Sdk.LooksRare.Addresses.Exchange[chainIdInt];

    case 'manifold':
      return Sdk.Manifold.Addresses.Exchange[chainIdInt];

    case 'mint':
      return constants.AddressZero;

    case 'nftx':
      return Sdk.Nftx.Addresses.MarketplaceZap[chainIdInt];

    case 'nouns':
      return Sdk.Nouns.Addresses.AuctionHouse[chainIdInt];

    case 'quixotic':
      return Sdk.Quixotic.Addresses.Exchange[chainIdInt];

    case 'rarible':
      return Sdk.Rarible.Addresses.Exchange[chainIdInt];

    case 'seaport':
      return Sdk.SeaportV11.Addresses.Exchange[chainIdInt];

    case 'seaport-v1.4':
      return Sdk.SeaportV14.Addresses.Exchange[chainIdInt];

    case 'seaport-v1.5':
      return Sdk.SeaportV15.Addresses.Exchange[chainIdInt];

    case 'sudoswap':
      return Sdk.Sudoswap.Addresses.PairFactory[chainIdInt];

    case 'universe':
      return Sdk.Universe.Addresses.Exchange[chainIdInt];

    case 'wyvern-v2':
      return Sdk.WyvernV2.Addresses.Exchange[chainIdInt];
    case 'wyvern-v2.3':
      return Sdk.WyvernV23.Addresses.Exchange[chainIdInt];
    case 'x2y2':
      return Sdk.X2Y2.Addresses.Exchange[chainIdInt];
    case 'zeroex-v4-erc1155':
      return Sdk.ZeroExV4.Addresses.Exchange[chainIdInt];
    case 'zeroex-v4-erc721':
      return Sdk.ZeroExV4.Addresses.Exchange[chainIdInt];
    case 'zora-v3':
      return Sdk.Zora.Addresses.Exchange[chainIdInt];

    default:
      console.warn(`Unknown source: ${orderKind}`);
      return constants.AddressZero;
  }
};
