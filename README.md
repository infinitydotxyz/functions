# Functions 
* Contains a few services
    * indexer
    * orderbook-sync
    * firebase functions
* Env files are automatically selected based on dev/prod and local/deploy

## Deploying

* Indexer
    * Prod `npm run deploy:indexer:prod`
    * Dev not configured
* Orderbook sync
    * Prod `npm run deploy:orderbook:prod`
    * Dev `npm run deploy:orderbook:dev`
* Firebase functions 
    * Prod `npm run deploy:prod`
    * Dev `npm run deploy:dev`

## Adding support for a new marketplace 

### Supporting scraping orders
1. Add the marketplace to the `OrderSource` type in `lib/src/types/core/orderbook/order-source.ts` 
    * This should be the Reservoir `OrderKind`, currently located here: (https://github.com/reservoirprotocol/indexer/blob/main/packages/indexer/src/orderbook/orders/index.ts)
2. Implement an OrderTransformer for the marketplace 
    * Example: `src/lib/orderbook/order-transformer/seaport`
3. Update the config in `src/lib/orderbook/config.ts`
4. Update get marketplace address `src/lib/utils/get-marketplace-address.ts` 
5. There tend to be breaking changes in the reservoir sdk, fix anything that's now broken
6. Update the matching engine so it can execute these new orders (see the matching engine README.md)