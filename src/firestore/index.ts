import admin, { ServiceAccount } from 'firebase-admin';
// todo adi update this for prod
import * as serviceAccount from '../creds/nftc-dev-firebase-creds.json';

let db: FirebaseFirestore.Firestore;

export function getDb(): FirebaseFirestore.Firestore {
  if (!db) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as ServiceAccount)
    });
    db = admin.firestore();
  }
  return db;
}