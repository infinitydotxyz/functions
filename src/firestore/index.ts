import admin, { ServiceAccount } from 'firebase-admin';
// import * as serviceAccount from '../creds/nftc-dev-firebase-creds.json';
import * as serviceAccount from '../creds/nftc-test.json'

let db: FirebaseFirestore.Firestore;

export function getDb(): FirebaseFirestore.Firestore {
  if (!db) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as ServiceAccount)
    });
    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}
