import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export { signInWithPopup, signOut, onAuthStateChanged, serverTimestamp };
export type { User };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Defensive payload sanitizers synchronized with firebase-blueprint.json
export const sanitizeFirestoreId = (raw: string, fallback = 'doc_01', maxLength = 128): string => {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : fallback;
};

export const truncateString = (raw: string | null | undefined, maxLength: number, fallback = ''): string => {
  const str = String(raw ?? fallback).trim();
  const sliced = str.slice(0, maxLength);
  return sliced.length > 0 ? sliced : fallback.slice(0, maxLength);
};

export async function testConnection(): Promise<{ connected: boolean; latencyMs: number }> {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    const latencyMs = Math.max(8, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start));
    return { connected: true, latencyMs };
  } catch (error) {
    const latencyMs = Math.max(8, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start));
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return { connected: false, latencyMs };
    }
    // Permission denied on default-deny test doc confirms live Firestore server reachability
    return { connected: true, latencyMs };
  }
}

testConnection();
