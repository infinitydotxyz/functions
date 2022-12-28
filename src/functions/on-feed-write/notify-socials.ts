import { FeedEvent } from '@infinityxyz/lib/types/core';

import { notifyDiscordWebhook } from './socials/discord';

/**
 * This function posts a feed event to social media such as Discord and Twitter.
 */
export async function notifySocials(event: FeedEvent) {
  await notifyDiscordWebhook(event);
  // TODO: twitter
}
