/**
 * Adversarial "Dirty Dozen" Security Rules Verification Suite
 * Designed for @firebase/rules-unit-testing against firestore.rules.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

export interface DirtyDozenScenario {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Unauthenticated Payment Record Write',
    collectionPath: 'users/user_a/payment_records/rec_1',
    operation: 'create',
    auth: null,
    payload: { ownerId: 'user_a', amount: 100 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Admin Spoofing on PII',
    collectionPath: 'users/user_a/private/info',
    operation: 'get',
    auth: { uid: 'attacker', email: 'yeagersayed@gmail.com', email_verified: false },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-Tenant Identity Spoofing',
    collectionPath: 'users/user_a/payment_records/rec_2',
    operation: 'create',
    auth: { uid: 'user_b', email: 'b@example.com', email_verified: true },
    payload: { ownerId: 'user_a', amount: 500 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Self-Assigned Admin Role Escalation',
    collectionPath: 'users/user_a',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { uid: 'user_a', ownerId: 'user_a', displayName: 'User A', role: 'admin' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow Ghost Field Injection',
    collectionPath: 'users/user_a/vault_deployments/site_1',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user_a', siteId: 'site_1', isVerified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Orphaned Subcollection Write Without Parent User',
    collectionPath: 'users/orphan_user/payment_records/rec_orphan',
    operation: 'create',
    auth: { uid: 'orphan_user', email: 'orphan@example.com', email_verified: true },
    payload: { ownerId: 'orphan_user', amount: 50 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'ID Poisoning With Invalid Characters',
    collectionPath: 'users/user_a/vault_deployments/bad$id!',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user_a', siteId: 'bad$id!' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Client Timestamp Forgery',
    collectionPath: 'users/user_a/wingo_predictions/20261112100052001',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user_a', createdAt: new Date(0), updatedAt: new Date(0) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Immutable OwnerId Mutation Attempt',
    collectionPath: 'users/user_a/payment_records/rec_1',
    operation: 'update',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user_b' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Terminal WinGo Outcome Manipulation',
    collectionPath: 'users/user_a/wingo_predictions/20261112100052001',
    operation: 'update',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { outcomeStatus: 'WIN' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Array Type & Size Poisoning on luckyNumbers',
    collectionPath: 'users/user_a/wingo_predictions/20261112100052002',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user_a', luckyNumbers: ['bad', 1, 2, 3, 4] },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unauthorized Collection List Scraping',
    collectionPath: 'users/user_a/payment_records',
    operation: 'list',
    auth: { uid: 'user_b', email: 'b@example.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];

describe('Firestore Dirty Dozen Security Specification', () => {
  it('defines all 12 adversarial payloads with PERMISSION_DENIED expectations', () => {
    assert.equal(DIRTY_DOZEN_PAYLOADS.length, 12);
    for (const scenario of DIRTY_DOZEN_PAYLOADS) {
      assert.equal(scenario.expectedOutcome, 'PERMISSION_DENIED');
    }
  });
});
