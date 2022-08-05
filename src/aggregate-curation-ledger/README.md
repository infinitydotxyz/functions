## Curation Rewards Calculations

### Firestore structure
- collections
    - {collectionId}
        - curationCollection
            - curationMetadata // used as a trigger to aggregate the ledger
                ```ts
                    ledgerRequiresAggregation: boolean
                    updatedAt: number
                ```
                - curationLedger // contains sale events, vote events and un-vote events 
                - curationBlockRewards // groups curationLedger events into daily _blocks_ containing fee distribution data
                    - {curationBlockId}
                        ```ts
                            numCurators: number;
                            numCuratorVotes: number;
                            totalProtocolFeesAccruedWei: string;
                            blockProtocolFeesAccruedWei: string;
                            startTimestamp: number;
                        ```
                        - curationBlockUserRewards
                            - {userAddress}
                                ```ts
                                    userAddress: string;
                                    votes: number;
                                    totalProtocolFeesAccruedWei: string;
                                    blockProtocolFeesAccruedWei: string;
                                ```


### How it works - Cloud Functions
* As events are received, they are added to the curation ledger
    * Sale events come from a contract listener
    * Un-Vote events should be generated and added to the ledger when an un-stake event is received from a contract listener
    * Vote events should be added to the ledger when the user votes on a collection
 
* Every X time interval (currently 30min) the curation ledger events are queried for unaggregated events and the corresponding curationMetadata doc is updated to indicate the ledger should be aggregated
* When the curationMetadata doc is updated, a cloud function is triggered to aggregate the ledger 

### How it works - Ledger aggregation
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

### TODO
- [X] Handle the case where there are fees for a collection but no votes - carry over and distribute to the first users to vote
- [ ] Contract listener for un-stake events, determine votes to remove, write un-vote events to ledgers
- [ ] Write vote events to ledger when user votes 
- [ ] Aggregate blocks to calculate total rewards over the full curation period
- [ ] How do we query for rewards by user?
- [ ] backfill sales 