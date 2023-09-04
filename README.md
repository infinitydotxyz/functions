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

## Purging Data
* Deploy the purge application `deploy:purge:prod`
* This application doesn't automatically shutdown, it currently requires you to check if purging has completed by checking if it's emitting logs and manually shutting it down.


### Rewards
* All reward events are stored in the collection `/pixl/pixlRewards/pixlRewardEvents`
* Rewards for a user are stored in a document at `/pixl/pixlRewards/pixlUserRewards/{address}`
  * Each address has user reward events that are stored in the collection `/pixl/pixlRewards/pixlUserRewards/{address}/pixlUserRewardsEvents`

  #### Processing
* Every x seconds, the rewards processor will be started. This will cause it to check for events where processed=false and process them according to the event type.
    * This may involve saving stats data, and/or saving a user reward event
    * This process is designed to only utilize a single instance - ideally a minimal amount of async work should be done here, any current async work can be moved to a pre-processing step to increase throughput
* Every x seconds, the user rewards trigger process will be started. This will cause it to check for user reward events where processed=false and trigger processing for that user
    * This process is designed to only utilize a single instance - if increased throughput is required, we can split the query based on user addresses and run multiple queries at once
* When processing is triggered for a user's reward event it will load the aggregated rewards, and update them based on any unprocessed event.
    * This process is designed to support a high concurrency - and we only need to increase the concurrency setting on the queue and ensure the server has enough resources to handle the load
