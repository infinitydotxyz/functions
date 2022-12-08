import { BigNumberish } from 'ethers';

import { toLexicographicalStr } from '@infinityxyz/lib/utils';

import { DocRef, Firestore } from '../../../firestore/types';
import { ReservoirOrderEvent } from './types';

export const getReservoirOrderEventId = (id: BigNumberish) => {
  return toLexicographicalStr(id, 128);
};

export const getReservoirOrderEventRef = (db: Firestore, orderId: string, eventId: BigNumberish) => {
  const orderRef = db.collection('ordersV2').doc(orderId);

  const id = getReservoirOrderEventId(eventId);

  const eventRef = orderRef.collection('reservoirOrderEvents').doc(id) as DocRef<ReservoirOrderEvent>;

  return eventRef;
};
