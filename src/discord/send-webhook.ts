import phin from 'phin';
import { DiscordEmbed } from './types';

export async function sendWebhook(url: string, options: {avatarUrl: string, username: string}, embeds: DiscordEmbed[]) {
  try {
    const res = await phin({
      url,
      method: 'POST',
      data: JSON.stringify({
        avatar_url: options.avatarUrl,
        username: options.username,
        embeds
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
