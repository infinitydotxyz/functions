import EventEmitter from 'events';
import WS from 'ws';

import { Logger, getComponentLogger } from '@/lib/logger';

import { getClientUrl } from '../api/get-client';
import { ResponseByEvent, Responses } from './response';
import { Subscriptions } from './subscription';
import { sleep } from '@/lib/utils';


export type Handler<T extends Subscriptions> = (data: ResponseByEvent[T['event']]) => void;

interface Sub<T extends Subscriptions> {
  event: T;
  handler: Handler<T>;
}

export class ReservoirWebsocketClient {
  protected url: URL;
  private ws: WS;
  protected isConnected: boolean;

  protected logger: Logger;

  protected subscription: Sub<Subscriptions>;

  protected emitter: EventEmitter;

  protected mostRecentEventTimestamp: number;

  protected shutdown = false;

  constructor(protected chainId: string, protected apiKey: string, options?: { logger?: Logger }) {
    this.logger = options?.logger ?? getComponentLogger(`ws:chain:${this.chainId}`);
    const baseUrl = getClientUrl(this.chainId).ws;
    baseUrl.searchParams.append('api-key', this.apiKey);
    this.url = baseUrl;
    this.ws = new WS(this.url);
    this.isConnected = false;
    this.emitter = new EventEmitter;
  }

  public connect = async <T extends Subscriptions>(sub: Sub<T>, attemptReconnect = true, attempt = 0) => {

    if (this.isConnected) {
      throw new Error(`Cannot connect a client more than once`);
    }

    if (attempt > 5) {
      this.logger.warn(`Failed to connect to client multiple times, sleeping...`);
      const duration = attempt * 3_000;
      await sleep(duration);
    }

    this.isConnected = true;
    await new Promise<void>((resolve, reject,) => {
      this.subscription = sub as unknown as Sub<Subscriptions>;
      let hasResolved = false;

      this.ws.on('open', () => {
        this.logger.info('Connected!');
        attempt = 0;
        this.ws.once('message', (data) => {
          this.logger.info(`Received connection message`);
          const response = JSON.parse(data.toString());
          if (response.status === 'ready') {
            if (!hasResolved) {
              hasResolved = true;
              this.registerListeners();
              this.subscribe().catch((err) => {
                this.logger.error(`Failed to subscribe ${err}`);
                this.ws.close();
              });
              resolve();
            }
          } else {
            this.logger.info(`Status is not ready. Status ${response.status} ${JSON.stringify(response, null, 2)}`);
            if (!hasResolved) {
              hasResolved = true;
              reject(response?.data?.message);
            }
          }
        });
      });

      this.ws.on('close', () => {
        this.logger.info('Connection closed');
        this.onDisconnect();
        this.removeListeners();
        this.isConnected = false;
        if (!hasResolved) {
          hasResolved = true;
          resolve();
        }

        if (this.shutdown || !attemptReconnect) {
          return;
        }
        this.logger.info(`Attempting to reconnect`);
        this.ws = new WS(this.url);
        this.connect(this.subscription, attemptReconnect, attempt + 1).then(() => {
          this.logger.info(`Reconnected!`);
        });
      });

      this.ws.on('error', (err) => {
        this.logger.error(`Connection error ${err}`);
        if (!hasResolved) {
          hasResolved = true;
          resolve();
        }
        this.ws.close();
      });
    });
  };

  protected registerListeners() {
    this.ws.on('message', (message) => {
      const data = JSON.parse(message.toString()) as Responses;
      if (data.type === 'event') {
        this.onEvent(data.published_at);
        this.subscription.handler(data);
      }
    });
  }

  on(event: 'connect' | 'disconnect', handler: (data: { timestamp: number }) => void) {
    this.emitter.on(event, handler);
    return () => {
      this.emitter.off(event, handler);
    }
  }

  protected onDisconnect() {
    if (this.mostRecentEventTimestamp) {
      this.emitter.emit('disconnect', { timestamp: this.mostRecentEventTimestamp });
      this.mostRecentEventTimestamp = 0;
    }
  }

  protected onEvent(timestamp: number) {
    if (!this.mostRecentEventTimestamp) {
      this.mostRecentEventTimestamp = timestamp;
      this.emitter.emit('connect', { timestamp: this.mostRecentEventTimestamp });
    }
  }

  protected removeListeners() {
    this.ws.removeAllListeners();
  }

  protected async subscribe() {
    this.logger.info(`Subscribing to event ${this.subscription.event.event}`);
    this.ws.send(JSON.stringify(this.subscription.event));
    await new Promise<void>((resolve, reject) => {
      this.ws.once('message', (data) => {
        const response = JSON.parse(data.toString());
        if (response.type !== 'subscribe') {
          reject(`Received unknown event. ${response.type}`);
        } else if (response.status !== 'success') {
          reject(`Subscription is not ready`);
        } else {
          this.logger.info(`Subscribed to event ${this.subscription.event.event}`);
          resolve();
        }
      });
    });
  }

  close = (options?: { shutdown: boolean }) => {
    if (options?.shutdown) {
      this.shutdown = true;
    }
    this.ws.close();
  }
}
