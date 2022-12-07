import { BigNumberish } from 'ethers';

import { toLexicographicalStr } from '@infinityxyz/lib/utils';

import { DocRef, Firestore } from '../../../firestore/types';
import { FirestoreOrderEvent } from './types';

export const getOrderEventId = (id: BigNumberish) => {
  return toLexicographicalStr(id, 128);
};

export const getOrderEventRef = (db: Firestore, orderId: string, eventId: BigNumberish) => {
  const orderRef = db.collection('ordersV2').doc(orderId);

  const id = getOrderEventId(eventId);

  const eventRef = orderRef.collection('orderStatusEvents').doc(id) as DocRef<FirestoreOrderEvent>;

  return eventRef;
};
