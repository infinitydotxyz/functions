

## Matching Engine

* Firestore Structure
```
orders
    <order id>: FirestoreOrder
        orderItems
            <random id>: FirestoreOrderItem
orderMatches
    <listingId:offerId>: FirestoreOrderMatch
```

* Order - a user expressing their intent to buy/sell some nft(s)
    * can be in states `validActive`, `validInactive` or `invalid`
        * `validActive` - can be fulfilled
        * `validInactive` - can become valid at some point in the future but is not currently valid
            * start timestamp has not been reached yet
            * insufficient balance - increasing balance will result in the order becoming active again
        * `invalid` - can no longer be fulfilled
            * end timestamp has been reached
            * order has been cancelled
* Order match - a fulfillment of intents (i.e. orders)
    * can be in states `active`, `inactive`, `matched` or `error`
        * `inactive` - the match is pending until some timestamp when it becomes valid
        * `active` - actively trying to validate and submit a transaction to fulfill this match
        * `matched` - a transaction has been included to fulfill this match
        * `invalid` - the match is no longer valid due to one or more of the orders being invalid/validInactive
    * order matches are searched for and created anytime an order becomes valid active
    * order matches are marked `matched` by the transaction broadcaster 
    * order matches are marked `invalid` anytime at least one of the orders contained are marked `invalid` or `validInactive`

## Order Match Types
#### Order Match 
* A match between two orders
* Each order specifies some order items (containing specific collection/token constraints) and a `numItems` that need to be fulfilled for a match to be created

#### One to one order match 
* A subset of the Order Match order type that occurs when the following is true
    * Both orders specify a `numItems` of 1
    * The match results in a single nft being transferred


## One to many matching
![graph overview](https://github.com/mavriklabs/functions/blob/main/assets/graph-overview.png)
