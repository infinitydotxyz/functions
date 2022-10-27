/**
 * WARNING: this file only exists to test the webhook manually!
 * 
 * Usage:
 * 
 * $ npx ts-node ./src/functions/on-feed-write/socials/discord-test.ts
 */

import { NftListingEvent, NftOfferEvent, NftSaleEvent } from '@infinityxyz/lib/types/core';
import { notifyDiscordWebhook } from './discord';

const dummyEvents = [
  {
    usersInvolved: [
      '0xc3394a64b9071e415b1add3c4944dcb5ec93936d',
      '0x476f34bf3bb1bcf2bb051e899b7a1eff4ae8794e'
    ],
    type: 'NFT_SALE',
    collectionProfileImage: 'https://lh3.googleusercontent.com/v4R-GVSbBqHQwU2hP3T4oHLIDZnAcM9toi5wBGyvx494ukpx3HCILLrhJQZIWTMX3dWqXzyRWrvXjqeO1otiB53TslpnFEvX_pwwvw=s120',
    hasBlueCheck: false,
    buyer: '0xc3394a64b9071e415b1add3c4944dcb5ec93936d',
    seller: '0x476f34bf3bb1bcf2bb051e899b7a1eff4ae8794e',
    sellerDisplayName: '0x476f34bf3bb1bcf2bb051e899b7a1eff4ae8794e',
    buyerDisplayName: '0xc3394a64b9071e415b1add3c4944dcb5ec93936d',
    price: 0.19,
    paymentToken: '0x0000000000000000000000000000000000000000',
    source: 'INFINITY',
    tokenStandard: 'ERC721',
    txHash: '0x10bf752036fb177195252fb78c8b223445ce8c19f4f4b513fd14cd95a35bd96e',
    quantity: 1,
    chainId: '1',
    collectionAddress: '0x8b19a0b00eadb34ade0803062fee1e96e13a2dfd',
    collectionName: 'Wrapped Etherization',
    collectionSlug: 'wrappedetherization',
    nftName: 'Jami',
    nftSlug: 'jami',
    likes: 0,
    comments: 0,
    tokenId: '505',
    image: 'https://lh3.googleusercontent.com/jsS5SZwOwLoBLUUoDTp9pFofgNVXkt_tlkr_L6NrIyJ2IlcjwAGPrP_976FYk_CJS7-9UlfHQl4xCFFJX9CFLvZz6N5BdA2r98RVDA',
    timestamp: 1666881035000,
    internalUrl: 'https://infinity.xyz/asset/1/0x8b19a0b00eadb34ade0803062fee1e96e13a2dfd/505',
    externalUrl: 'https://etherscan.io/tx/0x10bf752036fb177195252fb78c8b223445ce8c19f4f4b513fd14cd95a35bd96e'
  } as NftSaleEvent,
  {
    usersInvolved: [
      '0xc3394a64b9071e415b1add3c4944dcb5ec93936d',
      '0x476f34bf3bb1bcf2bb051e899b7a1eff4ae8794e'
    ],
    type: 'NFT_OFFER',
    collectionProfileImage: 'https://lh3.googleusercontent.com/v4R-GVSbBqHQwU2hP3T4oHLIDZnAcM9toi5wBGyvx494ukpx3HCILLrhJQZIWTMX3dWqXzyRWrvXjqeO1otiB53TslpnFEvX_pwwvw=s120',
    hasBlueCheck: false,
    buyer: '0xc3394a64b9071e415b1add3c4944dcb5ec93936d',
    seller: '0x476f34bf3bb1bcf2bb051e899b7a1eff4ae8794e',
    sellerDisplayName: '0x476f34bf3bb1bcf2bb051e899b7a1eff4ae8794e',
    buyerDisplayName: '0xc3394a64b9071e415b1add3c4944dcb5ec93936d',
    price: 0.19,
    paymentToken: '0x0000000000000000000000000000000000000000',
    source: 'SEAPORT',
    tokenStandard: 'ERC721',
    txHash: '0x10bf752036fb177195252fb78c8b223445ce8c19f4f4b513fd14cd95a35bd96e',
    quantity: 1,
    chainId: '1',
    collectionAddress: '0x8b19a0b00eadb34ade0803062fee1e96e13a2dfd',
    collectionName: 'Wrapped Etherization',
    collectionSlug: 'wrappedetherization',
    nftName: 'Jami',
    nftSlug: 'jami',
    likes: 0,
    comments: 0,
    tokenId: '505',
    image: 'https://lh3.googleusercontent.com/jsS5SZwOwLoBLUUoDTp9pFofgNVXkt_tlkr_L6NrIyJ2IlcjwAGPrP_976FYk_CJS7-9UlfHQl4xCFFJX9CFLvZz6N5BdA2r98RVDA',
    timestamp: 1666881035000,
    internalUrl: 'https://infinity.xyz/asset/1/0x8b19a0b00eadb34ade0803062fee1e96e13a2dfd/505',
    externalUrl: 'https://etherscan.io/tx/0x10bf752036fb177195252fb78c8b223445ce8c19f4f4b513fd14cd95a35bd96e',
    startPriceEth: 1.337,
    endPriceEth: 6.69,
    endTimeMs: 0,
    isSellOrder: false,
    makerAddress:  '0xdbd8277e2e16aa40f0e5d3f21ffe600ad706d979',
    makerUsername: 'infinity',
    orderId: '0xe0b5569ff3569cd9263e0cd069ab6ac32ce5da593bc851dc377973615478ed1a',
    orderItemId: '1695d38adc9b70a39931024f28044abe6ba78c702557661e66adf40319b9f441',
    startTimeMs: 1656925384212,
    takerAddress: '',
    takerUsername: '',
  } as NftOfferEvent,
  {
    usersInvolved: [
      '0xc3394a64b9071e415b1add3c4944dcb5ec93936d',
      '0x476f34bf3bb1bcf2bb051e899b7a1eff4ae8794e'
    ],
    type: 'NFT_LISTING',
    collectionProfileImage: 'https://lh3.googleusercontent.com/v4R-GVSbBqHQwU2hP3T4oHLIDZnAcM9toi5wBGyvx494ukpx3HCILLrhJQZIWTMX3dWqXzyRWrvXjqeO1otiB53TslpnFEvX_pwwvw=s120',
    hasBlueCheck: false,
    buyer: '0xc3394a64b9071e415b1add3c4944dcb5ec93936d',
    seller: '0x476f34bf3bb1bcf2bb051e899b7a1eff4ae8794e',
    sellerDisplayName: '0x476f34bf3bb1bcf2bb051e899b7a1eff4ae8794e',
    buyerDisplayName: '0xc3394a64b9071e415b1add3c4944dcb5ec93936d',
    price: 0.19,
    paymentToken: '0x0000000000000000000000000000000000000000',
    source: 'SEAPORT',
    tokenStandard: 'ERC721',
    txHash: '0x10bf752036fb177195252fb78c8b223445ce8c19f4f4b513fd14cd95a35bd96e',
    quantity: 1,
    chainId: '1',
    collectionAddress: '0x8b19a0b00eadb34ade0803062fee1e96e13a2dfd',
    collectionName: 'Wrapped Etherization',
    collectionSlug: 'wrappedetherization',
    nftName: 'Jami',
    nftSlug: 'jami',
    likes: 0,
    comments: 0,
    tokenId: '505',
    image: 'https://lh3.googleusercontent.com/jsS5SZwOwLoBLUUoDTp9pFofgNVXkt_tlkr_L6NrIyJ2IlcjwAGPrP_976FYk_CJS7-9UlfHQl4xCFFJX9CFLvZz6N5BdA2r98RVDA',
    timestamp: 1666881035000,
    internalUrl: 'https://infinity.xyz/asset/1/0x8b19a0b00eadb34ade0803062fee1e96e13a2dfd/505',
    externalUrl: 'https://etherscan.io/tx/0x10bf752036fb177195252fb78c8b223445ce8c19f4f4b513fd14cd95a35bd96e',
    startPriceEth: 1.337,
    endPriceEth: 6.69,
    endTimeMs: 0,
    isSellOrder: true,
    makerAddress:  '0xdbd8277e2e16aa40f0e5d3f21ffe600ad706d979',
    makerUsername: 'infinity',
    orderId: '0xe0b5569ff3569cd9263e0cd069ab6ac32ce5da593bc851dc377973615478ed1a',
    orderItemId: '1695d38adc9b70a39931024f28044abe6ba78c702557661e66adf40319b9f441',
    startTimeMs: 1656925384212,
    takerAddress: '',
    takerUsername: '',
  } as NftListingEvent,
];

async function main() {
  for (const dummyEvent of dummyEvents) {
    await notifyDiscordWebhook(dummyEvent);
  }
}

void main();
