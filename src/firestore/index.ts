import admin, {ServiceAccount} from "firebase-admin";
import * as serviceAccount from "../creds/nftc-infinity-firebase-creds.json";

let db: FirebaseFirestore.Firestore;

export function getDb(): FirebaseFirestore.Firestore {
  if (!db) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as ServiceAccount),
    });
    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}
