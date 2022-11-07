import { EventType, FeedEvent, NftListingEvent, NftOfferEvent, NftSaleEvent } from '@infinityxyz/lib/types/core';
import {WebhookClient, APIEmbed} from 'discord.js';
import { DISCORD_WEBHOOK_URL } from '../../../utils/constants';

const BASE_URL = 'https://infinity.xyz';

const webhook = new WebhookClient({ url: DISCORD_WEBHOOK_URL });

function embedSale(event: NftSaleEvent): APIEmbed {
  return {
    title: `${event.nftName} sold for ${event.price} ETH`,
    url: event.externalUrl,
    image: {
      url: event.image || event.collectionProfileImage
    },
    fields: [
      {
        name: 'Collection',
        value: `[${event.collectionName}](${BASE_URL}/collection/${event.collectionSlug})`
      },
      {
        name: 'Asset',
        value: `[${event.nftName}](${BASE_URL}/asset/${event.chainId}/${event.collectionAddress}/${event.tokenId})`
      },
      {
        name: 'Value',
        value: `${event.price} ETH`
      },
      {
        name: 'Buyer',
        value: `[${event.buyerDisplayName || event.buyer}](${BASE_URL}/profile/${
          event.buyer
        })`
      },
      {
        name: 'Seller',
        value: `[${event.sellerDisplayName || event.seller}](${BASE_URL}/profile/${
          event.seller
        })`
      },
    ]
  };
}

function embedOfferOrListing(event: NftOfferEvent | NftListingEvent): APIEmbed {
  const price = event.startPriceEth === event.endPriceEth ? event.endPriceEth : `${event.startPriceEth} - ${event.endPriceEth}`;
  const type = event.type === EventType.NftOffer ? 'Offer' : 'Listing';

  const embed: APIEmbed = {
    title: `${type} on ${event.nftName} for ${price} ETH`,
    url: event.internalUrl,
    image: {
      url: event.image || event.collectionProfileImage
    },
    fields: [
      {
        name: 'Collection',
        value: `[${event.collectionName}](${BASE_URL}/collection/${event.collectionSlug})`
      },
      {
        name: 'Asset',
        value: `[${event.nftName}${event.quantity > 1 ? ` (x${event.quantity})` : ''}](${BASE_URL}/asset/${event.chainId}/${event.collectionAddress}/${event.tokenId})`
      },
      {
        name: `${type} Price`,
        value: `${price} ETH`
      },
      {
        name: `${type} By`,
        value: `[${event.makerUsername || event.makerAddress}](${BASE_URL}/profile/${event.makerAddress})`
      },
    ]
  };

  if (event.takerAddress) {
    embed.fields?.push(
      {
        name: 'Accepted By',
        value: `[${event.takerUsername || event.takerAddress}](${BASE_URL}/profile/${event.takerAddress})`
      },
    );
  }

  return embed;
}

function buildEmbed(event: FeedEvent) {
  let embed: APIEmbed = {};

  switch (event.type) {
    case EventType.NftSale:
      embed = embedSale(event);
      break;
    case EventType.NftOffer:
    case EventType.NftListing:
      embed = embedOfferOrListing(event);
      break;
    default:
      throw new Error(`Feed event of type ${event.type} is not yet supported or implemented by the notifyDiscordWebhook function!`);
  }

  return embed;
}

/**
 * Posts a feed event to a discord webhook (configured in `DISCORD_WEBHOOK_URL`).
 */
export function notifyDiscordWebhook(event: FeedEvent) {
  const embed = buildEmbed(event);

  embed.color = 16777215; // white
  embed.timestamp = new Date(event.timestamp).toISOString();
  embed.footer = {
    text: event.type.split('_').pop() || '',
    icon_url: 'https://pbs.twimg.com/profile_images/1488261914731814915/nyEgvjn2_400x400.png'
  }

  return webhook.send({
    embeds: [
      embed
    ]
  });
}
