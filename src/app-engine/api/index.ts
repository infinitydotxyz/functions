import Fastify, { FastifyInstance, FastifyPluginOptions } from 'fastify';

import { config } from '@/config/index';
import { logger } from '@/lib/logger';

import endpoints from './endpoints';

Error.stackTraceLimit = Infinity;

const fastify = Fastify({
  jsonShorthand: false,
  ignoreTrailingSlash: true,
  ignoreDuplicateSlashes: true,
  logger: true,
  trustProxy: true
});

const auth = (instance: FastifyInstance, _opts: FastifyPluginOptions, next: () => void) => {
  instance.addHook('onRequest', async (request, reply) => {
    const { headers } = request;
    const apiKey = headers['x-api-key'];
    if (typeof apiKey === 'string') {
      if (apiKey.toLowerCase() === config.components.api.apiKey) {
        return;
      }
    }
    await reply.code(401).send({ error: 'Unauthorized' });
  });
  next();
};

const register = async () => {
  await fastify.register(auth, endpoints);
};

export const start = async () => {
  await register();
  try {
    await fastify.listen({ port: config.components.api.port, host: '0.0.0.0' });
    logger.log('api', `Listening on port ${config.components.api.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
