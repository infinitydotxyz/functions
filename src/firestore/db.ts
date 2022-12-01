import admin from 'firebase-admin';

import { config } from '../config';

let db: FirebaseFirestore.Firestore;

export function getDb(): FirebaseFirestore.Firestore {
  if (!db) {
    admin.initializeApp({
      credential: admin.credential.cert(config.firebase.serviceAccount)
    });
    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}
