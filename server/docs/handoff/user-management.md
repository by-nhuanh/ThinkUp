# User management backend handoff

Updated: 2026-11-10

## Status

Implementation is present and targeted backend tests have been run against the configured MongoDB database using scoped fixtures. Routes are mounted under `/api/admin/users`. The user-management schema/backfill migration and sample records were added to the configured `Thinkup` database on 2026-11-10; read-only calls through the Admin list service confirm the sample cohorts appear in normal list results. A full build and interactive application runtime check were not run. The admin UI is not connected; frontend API integration is outside the backend scope.

## Authentication and permissions

All routes require the existing Admin authentication middleware. Roles are taken from the authenticated Admin record, never from the request body.

- SA: read, edit, soft-delete; full detail including unmasked tax/CCCD/bank data.
- CA: read, lecturer decisions and discipline, evidence access, profile review lease. CA cannot update/delete user records through the user-management API.
- FA: read-only, with sensitive identifiers masked.
- CS: read, student lock/unlock, lecturer unlock; evidence upload.
- Student lock/upload: SA or CS. Student unlock: SA or CS.
- Lecturer decision/discipline/lease: SA or CA. Lecturer unlock: SA or CS.
- Student/lecturer exports: any read role; tax code is masked except for SA and CCCD/bank data are omitted.

## Mounted endpoints

Prefix: `/api/admin/users`

| Method/path | Authorization | Behavior |
|---|---|---|
| `GET /students` | SA/CA/FA/CS | Filtered, paginated student list; accepts `q`, `status`, `from`, `to`, `courseCount`, `page`, `pageSize`. Page size max 100, default 8. Course ownership and order counts are read from existing user/course/payment flows. |
| `GET /students/summary` | SA/CA/FA/CS | Total, new in 30 days, active, locked, month comparison. |
| `GET /students/:id` | SA/CA/FA/CS | User, enrolled courses/progress, recent orders and discipline audit history. |
| `GET /students/export` | SA/CA/FA/CS | CSV of filtered records; max 10,000 rows; formula-safe cells; export audit event. |
| `POST /students/lock` | SA/CS | Body for one target: `{ids, level, reason, evidence}`; for multiple targets use `evidenceByTarget: {"<userId>":["<evidenceId>"]}` so each user's stored evidence remains owner-bound. Max 100 IDs; level 1=7 days, 2=30 days, 3=indefinite. Revokes recorded sessions, attempts notification email, writes audit. Response includes UTC and `DD/MM/YYYY HH:mm:ss GMT+7` expiry plus mail failure count. |
| `POST /students/:id/unlock` | SA/CS | Body: `{reason}` (10–2,000 chars). Preserves prior audit history. |
| `GET /lecturers` | SA/CA/FA/CS | Filtered/paginated list built from linked applications and instructor profiles; applicant account can remain role `student` until activation. Accepts `q`, `status`, `legalStatus`, `field`, `from`, `to`, `page`, `pageSize`. KYC values are masked except for SA. |
| `GET /lecturers/summary` | SA/CA/FA/CS | Total, new in 30 days, legally complete active, review queue, restricted counts, published course count and open tickets. Payout request count is unavailable in the current backend. |
| `GET /lecturers/:id` | SA/CA/FA/CS | Application state, public-profile data and role-filtered private data. |
| `GET /lecturers/:id/courses` | SA/CA/FA/CS | Courses associated with the instructor identifier. |
| `POST /lecturers/:id/decision` | SA/CA | Body action `approve`, `reject`, or `request-documents`; validates current state and required reason/keys/deadline. Writes workflow state to `instructor_applications` and mirrors status to a linked profile for compatibility. `pending-contract` can request legal documents but cannot repeat professional approval. Email failures are queued; reserved `.invalid` addresses are not sent. |
| `POST /lecturers/:id/activate` | SA/CA | Requires active student account, application status `pending-contract`, signed legal status, verified KYC and tax flag; changes role to `instructor`, marks application active and synchronizes approved public fields into `instructor_profiles`. |
| `POST /lecturers/:id/discipline` | SA/CA | Body: `{level, reason, evidence, courseIds}`. Level 2 re-queries and validates ownership of every course ID before hiding those courses from sale. Level 3 locks the account, revokes sessions and hides all owned course listings. Hiding is tagged to the profile; unlock removes that tag for the same case. |
| `POST /lecturers/:id/unlock` | SA/CS | Body: `{reason}`. Restores prior profile state, unhides courses tagged to the same disciplinary profile, writes history/audit and queues email. |
| `POST /evidence/:userId` | SA/CS | Raw PNG/JPG/PDF body, `Content-Type` and `X-File-Name` headers; max 20 MB; signature checked; stored in `admin_user_evidence` as BSON binary. |
| `GET /evidence/:id` | SA/CA | Private attachment download, forced attachment disposition. |
| `POST /:id/claim`, `POST /:id/heartbeat`, `DELETE /:id/claim` | SA/CA | 90-second review lease; heartbeat extends it. List responses include current holder when available. Review mutations reject a lease held by a different Admin. |
| `PUT /:id` | SA | Allows a fixed set of user contact/name and instructor public-profile fields; rejects unknown fields. |
| `DELETE /:id` | SA | Soft delete only: sets `deleted_at`, revokes sessions and hides linked instructor profile. No Admin restore endpoint exists. IT must restore out of band. |

Errors use the server's JSON error handler. Expected codes include `USER_NOT_FOUND`, `PROFILE_BUSY`, `PROFILE_LEASE_EXPIRED`, `LECTURER_STATE_CONFLICT`, `LEGAL_REQUIREMENTS_INCOMPLETE`, `COURSE_SCOPE_INVALID`, `EVIDENCE_INVALID`, and `AUDIT_UNAVAILABLE`.

### Safe request examples

```json
POST /api/admin/users/students/lock
{
  "ids": ["64b000000000000000000001"],
  "level": 1,
  "reason": "Repeated policy violations",
  "evidence": ["uev_0123456789abcdef0123456789abcdef"]
}
```

For bulk lock, upload evidence separately for each target and pass the references keyed by that user's ID:

```json
{
  "ids": ["64b000000000000000000001", "64b000000000000000000004"],
  "level": 2,
  "reason": "Repeated policy violations",
  "evidenceByTarget": {
    "64b000000000000000000001": ["uev_0123456789abcdef0123456789abcdef"],
    "64b000000000000000000004": ["uev_abcdef0123456789abcdef0123456789"]
  }
}
```

```json
POST /api/admin/users/lecturers/64b000000000000000000002/discipline
{
  "level": 2,
  "reason": "Course content requires correction",
  "courseIds": ["64b000000000000000000003"],
  "evidence": ["uev_abcdef0123456789abcdef0123456789"]
}
```

```json
POST /api/admin/users/lecturers/64b000000000000000000002/decision
{
  "action": "request-documents",
  "documentKeys": ["signed_contract"],
  "guidance": "Please upload the signed agreement.",
  "deadlineDays": 7
}
```

## Data and learner impact

Reads: `users`, `instructor_profiles`, `courses`, `user_courses`/enrollment/progress through the existing course helper, `payment_transactions`, `admin_audit_logs`, `user_sessions`, and `support_tickets`.

Writes: account status/lock fields, instructor application/profile state and public profile, course `admin_hidden` flags for instructor discipline, evidence in `admin_user_evidence`, retryable notices in `admin_user_email_outbox`, and audit records in `admin_audit_logs`. No hard deletion occurs. Deleted users are hidden from ordinary user authentication/current-profile access and public instructor profile lookup; sessions are revoked. Historical order/progress/audit rows remain.

Student lock takes effect immediately and revokes existing `user_sessions`. Timed student lock expiry runs every minute in production/direct server mode; the job only unlocks when the same current lock level/timestamp is still due. Expiry logs an audit record. The client can continue to query expiry in UTC or display `lockedUntilLocal` in `Asia/Ho_Chi_Minh`.

Instructor level 2 hides selected courses from catalog, detail, cart availability and payment creation while existing enrollment/progress rows remain. Existing learners can continue to access study curriculum, progress, lessons, documents and tracked study activity for an enrolled hidden course; non-enrolled users cannot use hidden courses as previews. Level 3 also locks the instructor account, revokes sessions and hides all owned course listings; existing learners retain access as above. Unlock restores course flags tagged to that instructor profile. Other course discussion/Q&A workflows should receive a separate product-level access review if “hidden” is intended to suspend current teaching, because the approved rule currently preserves learner enrollment.

## Database field contract and inventory

MongoDB collections are schemaless in this repository; no JSON Schema validator, Mongoose model, or migration defining these records was found. The following fields are read/written by the feature and should be audited against actual records before rollout:

Read-only inventory executed on 2026-11-10 against the configured application DB `Thinkup`. It returned only collection names, document counts, field-presence counts, BSON types, and grouped states; no personal or bank values were read. Key observations before the migration:

- `users`: 24 records — 21 active students, 2 pending students, 1 active instructor. `is_active` exists on 6/24; admin discipline fields (`lock_level`, `locked_at`, `lock_reason`, `locked_by`) and application fields (`instructor_application_status`, `instructor_activated_at`) exist on 0/24. `email_verified` exists on 7/24 while `email_verified_at` exists on 23/24.
- `instructor_profiles`: 15 records. Every row has string `instructor_id`, but no row has `user_id`; none of the profile IDs match a `users._id`, and only 2 match the legacy `users.id` field (neither linked user has role `instructor`). `status`, `legal_status`, `kyc`, `tax_verified`, `field`, `stack`, `portfolio`, `gsahub`, `discipline_history`, `pre_discipline_status`, and `documents_request` are absent on all 15. Legacy aliases include `specializations`/`skills` on 15, `specialization` on 14, and `website` on 15. Bank and auto-payout settings exist on 14/15; the stored auto-payout flag is the string value `"1"` on those 14.
- `instructor_applications`: collection exists but has 0 records.
- `courses`: 95 records; 95 have `instructor_id`, 91 have `status`, and none have `admin_hidden` fields yet. Every course matched a profile by `instructor_id`.
- `user_sessions`: 55 records; 19 have non-null `revoked_at`, none have `revoke_reason`.
- `admin_audit_logs`, `admin_user_evidence`, and `admin_user_email_outbox` did not exist before the migration and had no records to backfill.
- `instructor_revenue_transactions`: 29 successful records with `course_id`, but no `instructor_id`; no payout/withdrawal request collection or payout execution collection was found. `payment_accounts` has 1 record and appears to be a payment-method/config record, not an instructor payout ledger.

The application URI was available via the workspace's root `.env`; its value was not printed. The initial inventory made no writes. The account-link mismatch and missing legal state fields meant the live data was not ready for lecturer administration/activation without an explicit, reviewed data-mapping/backfill plan.

### Schema migration applied

After explicit authorization, `src/admin/users/migrate-user-management-schema.js --apply` was run against `Thinkup`. The command first enforced `MONGODB_DB_NAME=Thinkup`, refused duplicate explicit profile links, and only backfilled data derivable from existing status/timestamp fields:

- Ensured 10 indexes for account listing/deletion, unique explicit profile-to-account links, instructor review/application lookup, sessions, course visibility, audit logs, evidence, and email retry. Creating indexes also created the previously absent empty `instructor_applications`, `admin_user_evidence`, and `admin_user_email_outbox` collections.
- Set `users.email_verified=true` on 15 active, non-deleted accounts where the flag was absent and `email_verified_at` could be converted to a valid date. Did not change pending accounts.
- Set `users.is_active=true` on 16 active, non-deleted accounts where the flag was absent. Did not change pending accounts or existing explicit flags.
- Marked 15 unlinked legacy profiles with `account_link_status:'needs_reconciliation'`; did not invent or assign `user_id` values.
- Wrote one migration audit record (`USER_MANAGEMENT_SCHEMA_V1_BACKFILL`) with aggregate counts only. No personal, contact, KYC, tax, or bank values were read for the migration or written by it.

Read-only post-migration verification confirmed 21 active students and 1 active instructor now have boolean `is_active` and `email_verified`; 2 pending students remain unchanged with those flags absent. The 15 legacy profiles remain without `user_id` and are marked `needs_reconciliation`. The 10 named indexes and one migration audit record are present. Migration is idempotent for these backfills/indexes and avoids repeated profile marker updates/audit inserts.

### Instructor workflow and demo records

- `instructor_applications` is now read as the application workflow source in the lecturer list/detail and decision/activation handlers; `instructor_profiles` remains the public-profile source and mirrors the current review status for compatibility. Applicant accounts can remain `role:'student'` until successful activation. Decisions no longer write `instructor_application_status` to `users`.
- Normal Admin lecturer/student lists and summary/dashboard KPIs include the generated cohort. No special query parameter or `is_test_data` field is needed to view the records. Public instructor profile lookup excludes profiles explicitly set to `is_public:false`; discipline and unlock endpoints require an active instructor.
- `scripts/seed-user-management-demo.js --apply` created batch `user-management-demo-20261110-v1`: 15 accounts, 15 linked internal profiles (`is_public:false`), and 15 application records. Distribution: 4 `pending-review`, 4 `pending-docs`, 4 `pending-contract`, 3 `rejected`. The accounts are pending, inactive, unverified and have no password. They use reserved `.invalid` email addresses and cannot log in. They remain non-public; activation requires legal signature, KYC and tax verification.
- Read-only inventory before cohort creation: 23 existing student accounts (21 active, 2 pending), 15 legacy instructor profiles, and 0 linked applications. There are now 50 additional active student accounts and 15 instructor applicants. `user_profiles` currently contains 0 documents; learner account records are counted from `users`.
- The normalization removed `is_test_data` and `demo_kind` from cohort records and removed test-only list/KPI filters. An internal `test_batch_id` is retained for precise maintenance and cleanup; it does not control normal display or query results.
- The normalization rewrote the 50 learner display names and IDs to unique, ordinary-looking Vietnamese values and rewrote the 15 instructor names/profile summaries to natural Vietnamese names and descriptions. The student activity text no longer contains sample/demo wording. Emails remain reserved `.invalid` addresses.

### Student client demo records

- `scripts/seed-student-demo.js --apply` created 50 active, email-verified student accounts in `users`, batch `user-management-student-demo-20261110-v1`. Names and student IDs are ordinary-looking values. Emails use `student-demo-001@example.invalid` through `student-demo-050@example.invalid`, so they cannot receive real email or password reset messages. The script generated one random shared password and printed it once at creation; the password is not recorded in the repository or audit log.
- Read-only verification after seeding found 50 accounts with the expected active/verified/password-hash fields; 50 onboarding answers; 75 `user_enrollments`; 75 matching `user_courses`; 75 `user_course_progress`; 197 `user_lesson_progress`; 137 activity logs; and 33 favorites. Enrollment course references resolve to published courses. No payment or order records were created.
- These accounts can sign in to the learner client using the one-time generated demo password. The accounts may browse and use their enrolled published courses; demo lesson progress is partial and synthetic. They can use normal client actions after login, which will update their own records through the usual paths. No session was created by the seed itself. Password reset/email flows are unavailable for `.invalid` addresses.
- The seed intentionally does not fabricate purchases, payments, certificates, timed learning sessions, quiz attempts, or course-level student counters. Those should only be generated through their respective approved product flows if a later demo requires them.
- Standard `GET /api/admin/users/students` and `/api/admin/users/students/summary` include this cohort without special parameters. Admin overview and analytics count their accounts, enrollments and progress as requested.
- The 15 instructor fixtures remain separate: they are pending/rejected applicants without passwords, inactive and not public, and cannot sign in. Their records exist to demonstrate the Admin review flow only.

### Legacy instructor reconciliation and proposed separation

The requested reconciliation was performed as a read-only identity-key comparison, not by matching names, emails, phone numbers, or other personal attributes:

- 15/15 legacy instructor profiles have an `instructor_id` used by all 95 courses, so profile-to-course ownership is internally consistent.
- 0/15 profile IDs match a `users._id` (ObjectId). Two match the legacy `users.id` value, but neither corresponding account currently has role `instructor`; the other 13 have no account match by these keys.
- Therefore, no profile can be safely auto-linked to a login account from the identifiers currently present. The two legacy matches are candidates for manual review only, not confirmed ownership. The 13 unmatched profiles require an authoritative mapping source or an account-claim/review process. Do not infer ownership from display/contact data.
- No identity link was written. Until mapping is approved, keep legacy profiles/courses on their current public-course identity; exclude these profiles from account-level admin actions that require a verified `users` owner.

Remaining target-model work for a separate instructor workflow:

1. Keep the existing `users` identity/authentication record as the login principal, but isolate the instructor application, review, legal, activation, and discipline workflow in instructor-owned records. This avoids duplicating credentials/sessions while removing the student application lifecycle from instructor operations.
2. Make `instructor_profiles.user_id` a required canonical string representation of `users._id`. A unique partial index for explicit string links is now present. Keep `instructor_id` as the stable public/course ownership key during compatibility, and map courses to canonical user/profile identity only after a reviewed backfill. Do not repurpose `instructor_id` before all course consumers are migrated.
3. Make `instructor_applications` the workflow source of truth, with `user_id`, explicit status and transition timestamps, reviewer/reason, requested documents, legal/contract status, KYC/tax verification, and version/audit metadata. Define its allowed transitions and contract-signature callback before activation is enabled. `users.role` remains the account authorization role; promotion to `instructor` occurs only at the agreed activation point and must preserve login/session continuity.
4. Normalize legacy public-profile fields through a documented compatibility mapping: `specializations`/`specialization` to the chosen canonical specialization field, `skills` retained as skills, and `website` mapped to a canonical public URL field. Do not fabricate missing `field`, `stack`, `portfolio`, or `gsahub`; allow null/empty until submitted and reviewed.
5. The DB now marks unlinked profiles with `account_link_status:'needs_reconciliation'`, and duplicate explicit profile links are prevented by the unique index. Still needed: an Admin-reviewed exact-ID reconciliation operation/report that verifies one account before linking and audits every approved link; unmatched rows remain manual exceptions.
6. Keep legal, disciplinary, and public-profile statuses separate. Define separate versioned discipline-case records or an explicit embedded history contract; level-3 payout holds require a real payout/ledger owner mapping and payout service before implementation.

Required data decisions before implementation: authoritative source for the 15 legacy account mappings; whether unmatched profiles remain public and courses remain purchasable during reconciliation; canonical application/profile schema and status transitions; account-role promotion timing; contract callback ownership/authenticity; retention and visibility for KYC/legal evidence; and whether `instructor_id` remains the long-term course owner key. Proposed acceptance checks include a dry-run reconciliation with 15 outcomes, rejection of duplicate/ambiguous links, unique account-profile linkage, course/profile compatibility, correct login before and after role promotion, and explicit separation of application/legal/discipline states.

| Collection | Fields required by current implementation | Gap / rollout check |
|---|---|---|
| `users` | Existing `_id`, `role`, `status`, `email`, `full_name`; lock fields `lock_level`, `locked_until`, `locked_at`, `lock_reason`, `locked_by`; deletion `deleted_at`, `deleted_by`; application `instructor_application_status`, `instructor_activated_at`; review lease fields | All 22 active accounts now have boolean `is_active` and `email_verified`; 2 pending accounts remain unchanged. Lock/deletion/application fields remain event-created and must be written by the relevant workflow. |
| `user_sessions` | `user_id` (string user ObjectId), `revoked_at`, `revoke_reason` | `user_id` is populated on 55/55. `revoked_at` is non-null on 19/55; `revoke_reason` is absent on all 55 and is written by current revocation actions. Lookup index is now present. |
| `instructor_profiles` | `user_id` canonical account link; `account_link_status`; `status`; `legal_status`; `kyc.verified`; `tax_verified`; profile fields `full_name`, `avatar_url`, `title`, `field`, `stack`, `bio`, `portfolio`, `linkedin`, `gsahub`; `discipline_history`, `pre_discipline_status`, `documents_request` | Unique partial index for explicit string `user_id` is present. All 15 unlinked profiles are marked `needs_reconciliation`, but none are linked to `users._id`; 2 legacy `users.id` matches are not current instructor accounts. Legal and discipline fields remain absent; activation must stay blocked until verified data/linkage is supplied. |
| `instructor_applications` | `user_id`, workflow status/phase, submitted/review/legal timestamps and actor/reason metadata | Collection and lookup index exist, with 15 synthetic applications visible in normal Admin lists. There is no applicant submission/client flow. Do not fabricate applications for legacy profiles. |
| `courses` | `instructor_id`; `admin_hidden`, `admin_hidden_by`, `admin_hidden_case` | Instructor visibility index is present. Ownership key mapping and multi-reason hide support remain required before broad disciplinary rollout. |
| `admin_user_evidence` | `_id`, `owner_user_id`, `filename`, `mime_type`, `size_bytes`, binary `bytes`, `uploaded_by`, `uploaded_at`, `linked_at`, `linked_entity` | Collection and owner/link index now exist; no evidence records, TTL/retention policy, or malware scanning configured. |
| `admin_user_email_outbox` | `_id`, `user_id`, `to`, message payload, `status`, `attempts`, `next_attempt_at`, lease and delivery timestamps | Collection and retry index now exist; no queued records or cleanup policy. Add operational monitoring for permanently failed notifications. |
| `admin_audit_logs` | Shared audit collection, with actor/action/time/details.entity | Collection and entity/time index now exist; migration audit record is present. Define retention and confirm operational ownership. |

Useful indexes to consider after reviewing current production indexes: `users(role,status,created_at)`, `users(locked_until,status)`, `users(deleted_at)`, `instructor_profiles(user_id/status/deleted_at)` and `(instructor_id/status/deleted_at)`, `courses(instructor_id,admin_hidden)`, `admin_user_evidence(owner_user_id,linked_at)`, and `admin_user_email_outbox(status,next_attempt_at,lease_until)`. No index or migration was applied in this pass.

## Important limitations and unverified areas

- Full build and interactive application runtime checks remain unverified. Targeted automated tests passed as listed below; this does not establish production readiness or cover every mounted route.
- The generated student emails use reserved `.invalid` addresses: they can log in with the seeded password hash if credentials are available, but cannot receive verification, reset, or notification email. The 15 generated instructor applications have no password, are inactive/unverified and non-public, so they cannot log in or be activated until truthful identity, legal, KYC, and tax requirements are completed.
- Google sign-in does not auto-link an existing account by matching email. The real-DB test confirms this rejects with `ACCOUNT_LINK_REQUIRED`; after a provider identity is already linked, login succeeds after promotion to instructor. There is no user-facing provider-link flow in the reviewed scope; decide whether to add an explicit authenticated account-link flow.
- No real application submission endpoint or contract-signature callback was found. Activation is exposed as an Admin endpoint but the 15 legacy profiles lack legal flags and reliable account links. Demo applications cannot be activated by design.
- `instructor_profiles` has bank details and `auto_payout_enabled` data, and a revenue ledger exists, but no payout request/execution service or collection was found in source or DB. The revenue ledger has no `instructor_id`; Mức 3 payout blocking and payout KPI remain unimplemented until a safe course-to-instructor accounting contract is approved.
- The current lecturer list can read linked `instructor_applications` records and linked profiles. The 15 legacy profiles still have no account match by `users._id` or `users.instructor_id`; they cannot safely appear as account-level applications until identity is reconciled. No identity-link backfill was applied.
- Course hiding blocks catalog/detail/preview/recommendation/cart/payment creation paths reviewed here. Existing learners retain enrollment data and can continue learning through the gated study curriculum, progress, lesson, document and tracked activity paths. Course discussion and Q&A access was not exhaustively changed or verified.
- The `admin_hidden` flag has a single profile case marker and can conflict with independent moderation/visibility restrictions. A multi-reason restriction field is needed if multiple systems can hide the same course concurrently.
- CSV is capped at 10,000 rows. Attachment bytes are stored in MongoDB; malware scanning and external object storage are not configured.
- Some legacy profile/course fields vary in naming; data mapping was based on current repository reads and needs fixture-backed testing.
- Email delivery failures are retained in `admin_user_email_outbox` and retried with bounded backoff; after eight attempts they are marked failed. Lock/state changes remain effective.
- Soft-deleted records are hidden from management list queries and auth/public-profile lookup. There is deliberately no restore endpoint for SA.

### Instructor demo access and contract sample update (2026-11-10)

- `node scripts/update-instructor-demo-access.js --apply` updated the 15 accounts in batch `user-management-demo-20261110-v1` to active login state and issued a unique password only where no password hash existed. All 15 password hashes were verified against the local credential handoff file, and one account completed a real `loginWithCredentials` call successfully. Credentials are stored locally in the ignored file `server/scripts/instructor-demo-credentials.csv`; do not commit or share it publicly. The synthetic `.invalid` email addresses cannot receive password-reset or notification email.
- Accounts remain `role:'student'` so Admin application review/activation remains the only role-promotion path. Application states remain 4 `pending-review`, 4 `pending-docs`, 4 `pending-contract`, and 3 `rejected`.
- A one-page PDF template was generated in Vietnamese, clearly marked “MẪU DEMO – KHÔNG CÓ GIÁ TRỊ PHÁP LÝ” and “CHƯA CÓ CHỮ KÝ”. The same Cloudinary asset is attached as an individual `documents[]` record on all 15 profiles and applications; its per-record URL/public ID can be replaced independently later.
- The document remains `sample_unsigned`; legal status remains incomplete; KYC and tax verification remain false. Therefore these accounts can log in to the client as students but cannot be activated as instructors. The template does not claim a real contract, identity, tax number, KYC check, or signature.
- Cloudinary upload succeeded and the Admin API reports the raw asset stored. Direct public delivery returns HTTP 401 with `X-Cld-Error: deny or ACL failure`, including a request with the local client origin. The authenticated backend download path described below resolves access without changing the product-environment ACL.

### Cloudinary document download fix (2026-11-10)

- Added `GET /api/admin/users/lecturers/:id/documents/:documentId/download`. It is mounted by the existing `/api/admin/users` router and permits SA/CA only (the same role group used for evidence-file reads). It verifies the document is attached to the specified account, downloads by Cloudinary `asset_id` through the authenticated Cloudinary API using server-side credentials, validates file signature/MIME and size (20 MB maximum), then returns an attachment with `Cache-Control: private, no-store` and `nosniff`.
- `GET /api/admin/users/lecturers/:id` no longer exposes raw Cloudinary URL, public ID, or asset ID in document records. It returns a backend `downloadUrl` only to SA/CA. FA/CS receive document metadata without a download URL.
- Successful downloads create `USER_LECTURER_DOCUMENT_DOWNLOAD` entries in `admin_audit_logs`; the audit contains document ID and MIME type, not the file bytes or Cloudinary credentials.
- Cloudinary public delivery remains denied by the environment ACL. The Admin API asset-download path was verified instead and returned the expected PDF bytes; the backend proxy does not require a public ACL change.
- `src/admin/users/test/lecturer-documents.admin.test.js` covers account/document ownership, malformed IDs, storage failure, content signature validation, Cloudinary data redaction, and SA/CA authorization.

## Source files

- `server/src/admin/users/users.admin.js`
- `server/src/admin/users/test/lecturer-documents.admin.test.js`
- `server/src/admin/users/migrate-user-management-schema.js`
- `server/scripts/seed-user-management-demo.js`
- `server/scripts/seed-student-demo.js`
- `server/scripts/normalize-user-management-demo.js`
- `server/src/admin/dashboard/dashboard.admin.js`
- `server/src/admin/dashboard/test/dashboard.admin.test.js`
- `server/src/admin/users/test/user-management-schema.test.js`
- `server/src/server.js`
- `server/src/user/auth/signin.user.js`
- `server/src/user/auth/signup.user.js`
- `server/src/user/auth/forgot-password.user.js`
- `server/src/user/account-security/account-security.user.js`
- `server/src/user/course/course.user.js`
- `server/src/user/course/rcm_course.js`
- `server/src/user/cart/cart.user.js`
- `server/src/user/payment/payment.service.js`
- `server/src/user/lesson/lesson.user.js`
- `server/src/user/learning-activity/learning-activity.user.js`
- `server/src/user/lesson/test/lesson.user.test.js`
- `server/src/user/learning-activity/test/learning-activity.user.test.js`
- `server/src/admin/users/test/users.admin.test.js`
- `server/scripts/update-instructor-demo-access.js`

## Checks

- Read-only review of route registration, middleware, handlers, auth/session call sites, course catalog/cart/payment gates, and repository diff: performed.
- `node --test src/admin/users/test/user-management-schema.test.js src/admin/users/test/users.admin.test.js src/admin/dashboard/test/dashboard.admin.test.js src/user/learning-activity/test/learning-activity.user.test.js`: 27 passed, 0 failed.
- `node --test src/user/auth/test/signin.user.test.js`: 8 passed, 0 failed against the configured MongoDB database; fixture user/session/audit/notification rows are cleaned by scoped IDs.
- `node --test src/user/course/test/course.user.test.js`: 32 passed, 0 failed against the configured MongoDB database. The review-sort case exposed mixed legacy rating types; the query now converts ratings/dates for stable numeric/date ordering.
- `node --test src/user/lesson/test/lesson.user.test.js`: 19 passed, 0 failed against the configured MongoDB database. Lesson fixture cleanup scopes discussion reactions/reports to fixture discussion IDs. The curriculum now invokes server-credited learning-time reads only for authenticated Mongo ObjectId user IDs.
- `node --test src/user/profile/test/profile.user.test.js`: 10 passed, 0 failed against the configured MongoDB database.
- Read-only Admin-service query against the configured DB returned 88 learner-list rows, including all 50 student cohort accounts, and 15/15 lecturer cohort accounts. The student summary total is 88 because the 15 pending instructor applicant accounts still have the student role; the UI should interpret the lecturer application workflow separately.
- `node --test src/admin/users/test/lecturer-documents.admin.test.js src/admin/users/test/users.admin.test.js src/admin/users/test/user-management-schema.test.js src/admin/dashboard/test/dashboard.admin.test.js src/admin/auth/test/admin-rbac.test.js`: 20 passed, 0 failed.
- Real Cloudinary/Admin API download through `downloadInstructorDocumentFile` using a current demo profile returned a 22,764-byte PDF with `application/pdf` and `%PDF-` signature. This verifies actual storage retrieval; the external public delivery URL remains ACL-denied by design.
- `git diff --check`: run; no whitespace errors reported. `node --check` passed on changed lesson/learning-activity files; prior checks passed on the seed/normalization scripts and Admin modules. A full build and interactive runtime check were not run.
- Read-only inventory and post-migration field/index verification against configured DB ran successfully; no document values were retrieved.
- Migration command: `node src/admin/users/migrate-user-management-schema.js --apply` from `server/`; completed with 10 indexes, 15 email-verification flags, 16 active flags, 15 unlinked-profile markers, and one audit record.
- Demo seed command: `node scripts/seed-user-management-demo.js --apply` from `server/`; created 15 users, 15 linked profiles, and 15 applications with no active application state.
- `node --check` passed on `scripts/seed-student-demo.js`, `scripts/seed-user-management-demo.js`, `scripts/normalize-user-management-demo.js`, `src/admin/users/users.admin.js`, `src/admin/dashboard/dashboard.admin.js`, `src/user/course/course.user.js`, and affected test files. Script modules imported successfully without executing DB writes.
- Student demo seed command completed: `node scripts/seed-student-demo.js --apply`; read-only batch verification returned 50 users, 75 enrollments and owned-course rows, 75 course-progress rows, 197 lesson-progress rows, 137 activity logs, 33 favorites, with all 75 enrollments linked to the 50 cohort accounts and references resolving to published courses. No payment/order records were created.
- Normalization command completed: `node scripts/normalize-user-management-demo.js --apply`; read-only verification found zero `is_test_data` fields across both account cohorts and related records, unique natural names for all 65 generated user accounts, and all 15 synthetic instructor profiles still marked `is_public:false`. Authentication behavior is covered by the 8 passing signin integration tests listed above.
- The user-management seed, student seed, and normalization scripts were physically moved under `server/scripts/` and imports updated. They are ignored by the repository root `.gitignore` (`server/scripts/*`); `admin_rules.md` prohibits modifying root files, so they remain ignored/untracked until the repository owner approves an exception outside the server scope.
