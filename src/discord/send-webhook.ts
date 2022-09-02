import phin from 'phin';
import { DiscordWebhook } from './types';

export async function sendWebhook(webhook: DiscordWebhook) {
  try {
    const res = await phin({
      url: webhook.url,
      method: 'POST',
      data: JSON.stringify({
        avatar_url: webhook.avatarUrl,
        username: webhook.username,
        embeds: webhook.embeds
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (res.statusCode !== 204) {
      throw new Error(res.body.toString());
    }
  } catch (err) {
    console.error(`Failed to send webhook`);
    console.error(err);
  }
}
