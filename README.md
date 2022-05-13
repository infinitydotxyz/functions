

## Matching Engine

* Firestore Structure
```
orders
    <order id>: FirestoreOrder
        orderItems
            <random id>: FirestoreOrderItem
orderMatches (only present for listings)
    <listingId:offerId>: FirestoreOrderMatch (matches are always offers)
```