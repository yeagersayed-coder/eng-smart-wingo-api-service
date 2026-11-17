# Firestore Security Architecture Specification

## 1. Data Invariants & Master Source of Truth
- **Master Gate**: `/users/{userId}` is the root ownership gate for every user-owned subcollection (`/users/{userId}/private/info`, `/users/{userId}/payment_records/{recordId}`, `/users/{userId}/wingo_predictions/{predictionId}`, `/users/{userId}/vault_deployments/{siteId}`).
- **Identity & Verification**: Every read/write requires `request.auth != null` AND `request.auth.token.email_verified == true`.
- **Ownership Integrity**: Every document must bind `ownerId == request.auth.uid` on creation, and `ownerId` + `createdAt` remain strictly immutable on update.
- **PII Isolation**: Emails (`email`, `connectedGmail`) exist exclusively under `/users/{userId}/private/info` and are readable/writable only by the verified owner (`isOwner(userId)`) or bootstrapped verified admin (`yeagersayed@gmail.com`).
- **Temporal Integrity**: `createdAt` and `updatedAt` are validated strictly against `request.time`.
- **Terminal State Locking**:
  - `PaymentRecord.status == 'EXPIRED'` cannot be reverted to `'ACTIVE'` by non-admin clients.
  - `WinGoTrackedPrediction.outcomeStatus in ['WIN', 'LOSS']` is terminal and cannot be modified by non-admin clients.
  - `VaultDeployment.status == 'ARCHIVED'` is terminal and cannot be modified by non-admin clients.

## 2. The "Dirty Dozen" Adversarial Test Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Write**: Creating `/users/user_a/payment_records/rec_1` with `auth = null`.
2. **Unverified Email Spoofing (Admin Impersonation)**: Reading `/users/user_a/private/info` with `email = "yeagersayed@gmail.com"` and `email_verified = false`.
3. **Cross-Tenant Identity Spoofing**: Creating `/users/user_a/payment_records/rec_1` as `user_b` with `ownerId: "user_a"` or mismatched `ownerId: "user_b"`.
4. **Self-Assigned Admin Role Escalation**: Creating `/users/user_a` with `role: "admin"` instead of `"member"`.
5. **Shadow / Ghost Field Injection**: Creating `/users/user_a/vault_deployments/site_1` containing an extra undeclared field `isVerified: true`.
6. **Orphaned Subcollection Write**: Creating `/users/user_a/payment_records/rec_1` when parent `/users/user_a` does not exist.
7. **ID Poisoning / Resource Exhaustion**: Writing `/users/user_a/vault_deployments/` with a 200-char or invalid symbol doc ID (`site$bad!`).
8. **Client Timestamp Forgery**: Creating `/users/user_a/wingo_predictions/pred_1` with a past client `Date` instead of `serverTimestamp()` (`request.time`).
9. **Immutable Field Mutation**: Updating `ownerId` or `createdAt` on an existing `/users/user_a/payment_records/rec_1`.
10. **Terminal State Bypass**: Updating a `WinGoTrackedPrediction` from `outcomeStatus: 'LOSS'` to `'WIN'` as a standard user.
11. **Value Type / Array Poisoning**: Creating `WinGoTrackedPrediction` with `luckyNumbers: ["not_int"]` or 10 elements (`size() > 3`).
12. **Blanket List Query Scraping**: Listing `/users/user_a/payment_records` without `ownerId == request.auth.uid` authorization (attempted by `user_b`).
