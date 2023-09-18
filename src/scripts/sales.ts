import 'module-alias/register';

import { ReservoirWebsocketClient } from '@/lib/reservoir/ws/client';
import { AskSubMessage } from '@/lib/reservoir/ws/subscription';

import { config } from '../config';

export const main = async () => {
  const client = new ReservoirWebsocketClient('1', config.reservoir.apiKey);

  const sub: AskSubMessage = {
    type: 'subscribe',
    event: 'ask.created',
    filters: {
      source: undefined,
      contract: undefined,
      maker: undefined,
      taker: undefined
    }
  };

  client.on('connect', (data: { timestamp: number }) => {
    console.log(`Connected!`, data.timestamp);
  });

  client.on('disconnect', (data: { timestamp: number }) => {
    console.log(`Disconnected!`, data.timestamp);
  });

  await client.connect({
    event: sub,
    handler: (res) => {
      console.log(res.event);
    }
  });

  console.log(`Client Connected!`);
  client.close({ shutdown: true });
};

void main();
