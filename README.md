

## Matching Engine

* Firestore Structure
```
orders
    <order id>: FirestoreOrder
        orderItems
            <random id>: FirestoreOrderItem
orderMatches
    <listingId:offerId>: FirestoreOrderMatch
        orderMatchItems
            <listingOrderItemId:offerOrderItemId>: FirestoreOrderItemMatch
```