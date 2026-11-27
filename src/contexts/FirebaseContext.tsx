import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  testConnection,
  handleFirestoreError,
  OperationType,
  sanitizeFirestoreId,
  truncateString,
  User,
} from '../firebase.js';

interface UserProfileState {
  preferredEngine: 'AUTO' | 'STANDALONE';
  preferredGame: '30s' | '1m';
  connectedGmail: string;
}

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  profileSynced: boolean;
  dbConnected: boolean;
  firestoreLatencyMs: number;
  signingIn: boolean;
  authError: string | null;
  profile: UserProfileState;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshConnection: () => Promise<void>;
  updatePreferences: (prefs: Partial<{ preferredEngine: 'AUTO' | 'STANDALONE'; preferredGame: '30s' | '1m' }>) => Promise<void>;
  updateConnectedGmail: (gmail: string) => Promise<void>;
}

const DEFAULT_PROFILE: UserProfileState = {
  preferredEngine: 'STANDALONE',
  preferredGame: '30s',
  connectedGmail: 'shaktimahto1213@gmail.com',
};

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileSynced, setProfileSynced] = useState(false);
  const [dbConnected, setDbConnected] = useState(false);
  const [firestoreLatencyMs, setFirestoreLatencyMs] = useState(24);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfileState>(DEFAULT_PROFILE);

  const refreshConnection = useCallback(async () => {
    const res = await testConnection();
    setDbConnected(res.connected);
    setFirestoreLatencyMs(res.latencyMs);
  }, []);

  useEffect(() => {
    refreshConnection();
    const timer = setInterval(refreshConnection, 15000);
    return () => clearInterval(timer);
  }, [refreshConnection]);

  const ensureUserDocuments = useCallback(async (currentUser: User) => {
    if (!currentUser.emailVerified) {
      setAuthError('Google account email must be verified to sync with Firestore.');
      setProfileSynced(false);
      return;
    }

    const uid = sanitizeFirestoreId(currentUser.uid, 'user_default', 128);
    const userPath = `users/${uid}`;
    const privatePath = `users/${uid}/private/info`;
    const userRef = doc(db, 'users', uid);
    const privateRef = doc(db, 'users', uid, 'private', 'info');

    try {
      const userSnap = await getDoc(userRef);
      const safeName = truncateString(currentUser.displayName, 100, 'Gateway User');
      const safePhoto = truncateString(currentUser.photoURL, 500, '');

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid,
          ownerId: uid,
          displayName: safeName,
          photoUrl: safePhoto,
          role: 'member',
          preferredEngine: 'STANDALONE',
          preferredGame: '30s',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const data = userSnap.data();
        setProfile((prev) => ({
          ...prev,
          preferredEngine: data.preferredEngine === 'STANDALONE' ? 'STANDALONE' : 'AUTO',
          preferredGame: data.preferredGame === '1m' ? '1m' : '30s',
        }));
        await updateDoc(userRef, {
          displayName: safeName,
          photoUrl: safePhoto,
          updatedAt: serverTimestamp(),
        });
      }

      try {
        const privateSnap = await getDoc(privateRef);
        const safeEmail = truncateString(currentUser.email, 254, 'user@example.com');
        if (!privateSnap.exists()) {
          await setDoc(privateRef, {
            ownerId: uid,
            email: safeEmail,
            connectedGmail: safeEmail,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setProfile((prev) => ({ ...prev, connectedGmail: safeEmail }));
        } else {
          const pData = privateSnap.data();
          const gmail = truncateString(pData.connectedGmail, 254, safeEmail);
          setProfile((prev) => ({ ...prev, connectedGmail: gmail }));
          await updateDoc(privateRef, {
            email: safeEmail,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (privErr) {
        handleFirestoreError(privErr, OperationType.WRITE, privatePath);
      }

      setProfileSynced(true);
      setAuthError(null);
    } catch (err) {
      setProfileSynced(false);
      handleFirestoreError(err, OperationType.WRITE, userPath);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        try {
          await ensureUserDocuments(nextUser);
        } catch (err: any) {
          setAuthError(err?.message || 'Failed to sync user profile to Firestore');
        }
      } else {
        setProfileSynced(false);
        setProfile(DEFAULT_PROFILE);
      }
    });
    return () => unsub();
  }, [ensureUserDocuments]);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(err?.message || 'Google sign-in popup closed or failed');
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
      setProfileSynced(false);
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to sign out');
    }
  }, []);

  const updatePreferences = useCallback(
    async (prefs: Partial<{ preferredEngine: 'AUTO' | 'STANDALONE'; preferredGame: '30s' | '1m' }>) => {
      setProfile((prev) => ({ ...prev, ...prefs }));
      if (!authReady || !user || !user.emailVerified || !profileSynced) return;
      const uid = sanitizeFirestoreId(user.uid, 'user_default', 128);
      const userPath = `users/${uid}`;
      try {
        await updateDoc(doc(db, 'users', uid), {
          ...prefs,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    },
    [authReady, user, profileSynced]
  );

  const updateConnectedGmail = useCallback(
    async (gmail: string) => {
      const safeGmail = truncateString(gmail, 254, 'shaktimahto1213@gmail.com');
      setProfile((prev) => ({ ...prev, connectedGmail: safeGmail }));
      if (!authReady || !user || !user.emailVerified || !profileSynced) return;
      const uid = sanitizeFirestoreId(user.uid, 'user_default', 128);
      const privatePath = `users/${uid}/private/info`;
      try {
        await updateDoc(doc(db, 'users', uid, 'private', 'info'), {
          connectedGmail: safeGmail,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, privatePath);
      }
    },
    [authReady, user, profileSynced]
  );

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        profileSynced,
        dbConnected,
        firestoreLatencyMs,
        signingIn,
        authError,
        profile,
        signInWithGoogle,
        signOutUser,
        refreshConnection,
        updatePreferences,
        updateConnectedGmail,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used inside a FirebaseProvider');
  }
  return ctx;
}
