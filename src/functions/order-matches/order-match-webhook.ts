import { FirestoreOrderMatches, FirestoreOrderMatchStatus } from "@infinityxyz/lib/types/core";
import { sendWebhook } from "../../discord/send-webhook";
import { DiscordEmbed, DiscordWebhook, EmbedField } from "../../discord/types";


export async function sendOrderMatchWebhook(url: string, orderMatch: FirestoreOrderMatches) {
    const embed = orderMatchToWebhook(orderMatch);
    const webhook: DiscordWebhook = {
        url,
        avatarUrl: 'https://storage.googleapis.com/infinity-static/images%2Fcollections%2F7b2254622f6e2474998feba5fbc475cc.undefined',
        username: 'Infinity Order Match Listener',
        embeds: [embed],
    }

    await sendWebhook(webhook);
}


function orderMatchToWebhook(orderMatch: FirestoreOrderMatches): DiscordEmbed {
    const value = orderMatch.state.priceValid;
    const title = `Orders Matched! Type: ${orderMatch.type} Value: ${value} WETH`;
    const color = 0x00ff00;
    const tokenImages: string[] = [];
    const collectionImages: string[] = [];
    const nftFields: EmbedField[] = Object.entries(orderMatch.matchData.orderItems).flatMap(
      ([collectionAddress, collection]) => {
        const nfts: EmbedField[] = Object.entries(collection.tokens).map(([tokenId, token]) => {
          const value = `${collectionAddress} - ${token.tokenId}`;
          const name = `${collection.collectionName} - ${token.tokenName}`;
          if (token.tokenImage) {
            tokenImages.push(token.tokenImage);
          }
          return { name, value, inline: false };
        });
  
        if (collection.collectionImage) {
          collectionImages.push(collection.collectionImage);
        }
        return nfts;
      }
    );
  
    const timestamp = new Date().toISOString();
  
    const images = [...tokenImages, ...collectionImages];
    const image = images.length > 0 ? { image: { url: images[0] } } : {};
  
    const url = `https://console.firebase.google.com/u/0/project/nftc-infinity/firestore/data/~2ForderMatches~2F${orderMatch.id}`;
    const txHash = orderMatch?.state.status === FirestoreOrderMatchStatus.Matched ? orderMatch.state.txHash : '';
  
    const embed: DiscordEmbed = {
      url,
      title,
      color,
      ...image,
      fields: nftFields,
      timestamp,
      footer: {
        text: `Txn: ${txHash}`
      }
    };
  
    return embed;
  }
  