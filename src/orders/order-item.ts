import { FirestoreOrderItem } from "@infinityxyz/lib/types/core/OBOrder";
import { OrderItemPrice } from "./orders.types";


export class OrderItem {
    constructor(private firestoreOrderItem: FirestoreOrderItem) {}

    public isMatch(orderItem: FirestoreOrderItem): boolean {
        const chainIdMatches = this.firestoreOrderItem.chainId === orderItem.chainId
        const addressMatches = this.firestoreOrderItem.collectionAddress === orderItem.collectionAddress;
        const tokenIdMatches = this.firestoreOrderItem.tokenId ? this.firestoreOrderItem.tokenId === orderItem.tokenId : true;
        const orderSideValid = this.firestoreOrderItem.isSellOrder !== orderItem.isSellOrder;

        /**
         * we might be okay with taking more/less
         */
        const numTokensMatches = this.firestoreOrderItem.numTokens === orderItem.numTokens;

        const intersection = this.getIntersection(this.firestoreOrderItem, orderItem);
        if(intersection === null) {
            return false;
        }
        return chainIdMatches && addressMatches && tokenIdMatches && orderSideValid && numTokensMatches;
    }

    public getIntersection(one: OrderItemPrice, two: OrderItemPrice): { timestamp: number, price: number} | null {
        const x = {
            '1': one.startTimeMs,
            '2': one.endTimeMs,
            '3': two.startTimeMs,
            '4': two.endTimeMs,
        };
        const y = {
            '1': one.startPriceEth,
            '2': one.endPriceEth,
            '3': two.startPriceEth,
            '4': two.endPriceEth,
        };

        const numerator = ((x['1'] - x['3']) * (y['3'] - y['4'])) - ((y['1'] - y['3']) * (x['3'] - x['4']));
        const denominator = ((x['1'] - x['2']) * (y['3'] - y['4'])) - ((y['1'] - y['2']) * (x['3'] - x['4']));
        const bezierParam = numerator / denominator;

        if(bezierParam < 0 || bezierParam > 1) {
            return null; // no intersection
        }

        const intersectionX = x['1'] + (bezierParam * (x['2'] - x['1']));
        const nearestSecond = Math.ceil(intersectionX / 1000) * 1000;
        const slope = (y['2'] - y['1']) / (x['2'] - x['1']);
        const yIntercept = y['1'] - (slope * x['1']);
        const priceAtNearestSecond = slope * nearestSecond + yIntercept;

        return {
            timestamp: nearestSecond,
            price: priceAtNearestSecond,
        }
    }
}
