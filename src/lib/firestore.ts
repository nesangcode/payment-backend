import admin from 'firebase-admin';
import { Firestore } from '@google-cloud/firestore';
import logger from './logger';
import * as dotenv from 'dotenv';

dotenv.config();

let db: Firestore;

export function initializeFirestore(): Firestore {
  if (db) {
    return db;
  }

  try {
    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
      const credentialsPath = process.env.FIREBASE_CREDENTIALS_PATH;
      const projectId = process.env.FIREBASE_PROJECT_ID;

      if (credentialsPath) {
        const serviceAccount = require(`../../${credentialsPath}`);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: projectId,
        });
      } else {
        // Use default credentials (for Cloud Run, etc.)
        admin.initializeApp({
          projectId: projectId,
        });
      }
    }

    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });

    logger.info('Firestore initialized successfully');
    return db;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Firestore');
    throw error;
  }
}

export function getFirestore(): Firestore {
  if (!db) {
    return initializeFirestore();
  }
  return db;
}

// Collection references
export const collections = {
  users: () => getFirestore().collection('users'),
  billingCustomers: () => getFirestore().collection('billing').doc('customers').collection('items'),
  subscriptions: () => getFirestore().collection('subscriptions'),
  entitlements: () => getFirestore().collection('entitlements'),
  invoices: () => getFirestore().collection('invoices'),
  payments: () => getFirestore().collection('payments'),
  payouts: () => getFirestore().collection('payouts'),
  ledger: () => getFirestore().collection('ledger'),
  webhooks: () => getFirestore().collection('webhooks'),
};

export default db;
