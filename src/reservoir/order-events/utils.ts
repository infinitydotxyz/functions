import { DocRef, Firestore } from '../../firestore/types';
import { FirestoreOrderEvent } from './types';

export const getOrderEventRef = (db: Firestore, orderId: string, eventId: number) => {
  const orderRef = db.collection('ordersV2').doc(orderId);
  const eventRef = orderRef.collection('orderStatusEvents').doc(`${eventId}`) as DocRef<FirestoreOrderEvent>;

  return eventRef;
};
