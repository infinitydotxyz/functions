## Curation Rewards Calculations

### Firestore structure
- collections
    - {collectionId}
        - curationCollection
            - {curationMetadata} // used as a trigger to aggregate the ledger/blocks/periods
                - curationLedger  
                    {random id} // sale event, vote event or un-vote event
                - curationBlockRewards 
                    - {curationBlockId} // a block containing the aggregated data from an hour of ledger events
                        - curationBlockUserRewards 
                            - {userAddress} // user data for the corresponding block
                - curationPeriodRewards 
                    - {curationPeriodId} // stores aggregated curation rewards for a full curation period (must be an integer number of blocks)
                        - curationPeriodUserRewards
                            - {user address} // user data for the corresponding period
            - {curationSnippet} // current curation data for this collection
                - curationSnippetUsers 
                    - {userAddress} // current user curation data for this collection

## How it works
### Cloud Functions
* As events are received, they are added to the curation ledger
    * Sale events come from a contract listener
    * Un-Vote events should be generated and added to the ledger when an un-stake event is received from a contract listener
    * Vote events should be added to the ledger when the user votes on a collection
 
* Every X time interval (currently 10min) the curation ledger events are queried for unaggregated events and the corresponding curationMetadata doc is updated to indicate the ledger should be aggregated
* A cloud function listens for the curation metadata doc to be updated. based on flags in the doc we either
    1. aggregate the ledger events in a block, and set a flag to aggregate blocks into periods
    2. aggregate blocks into periods and set a flag to update the current curation data
    3. update the current curation data 
* Delays in data updates
    * Since the ledger is triggered to aggregate every 10min, there will be at most ~10min delay in when blocks, periods, and current data are updated
    * __This is fine for collections but how do we update the list of collections a user has voted on immediately?__ 
### Ledger aggregation
* The ledger is queried for the oldest event requiring aggregation, we determine that this event belongs to block `X`
* All events since the beginning of block `X` are pulled from the db and grouped by their block
* The rewards calculation for the most recent block prior to `X` is pulled from the db 
* Calculate the fees for each block and each user
    1. decrement votes for users with un-vote events in the current block (remove users if necessary)
    2. increment votes for users with vote events in the current block
    3. calculate the total fees to be distributed
    4. calculate fees to distribute to each user using `userVotes * feesGeneratedInBlock / totalVotes`
    5. store the block rewards and user block rewards in the database
    6. start calculation for the next block if it exists

### 
### TODO
- [x] Handle the case where there are fees for a collection but no votes - carry over and distribute to the first users to vote
- [x] Aggregate blocks to calculate total rewards over the full curation period
- [x] how do we handle the case where a user should be removed from `curationPeriodUserRewards`?
- [x] How do we query for rewards by user? 
    * collection group query on `curationSnippetUsers` - what about historical data? 
- [ ] Contract listener for un-stake events, determine votes to remove, write un-vote events to ledgers 
- [ ] Write vote events to ledger when user votes 

    * Refactor handling of votes to use contract listeners to remove race conditions allowing double spending
        * User stakes/un-stakes/rage quits => update votes available in db, remove votes from collections if necessary
- [ ] Calculate APR for collections and users? - how do you calculate user APR? Should it be relative to eth or usd? 
    - [ ] Get current token price
- [ ] backfill sales
- [ ] How do we handle the times when rewards aren't live/when users shouldn't get curation rewards for? 
- [ ] Do we need to store some minimum collection level data in the docs to allow displaying data without an additional query? What about some minimum user level data? 
