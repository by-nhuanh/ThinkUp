import { getMongoDb, closeMongoDb } from '../../user/db.js';
import { pathToFileURL } from 'node:url';

const REQUIRED_DB_NAME = 'Thinkup';

export const USER_MANAGEMENT_INDEXES = [
  ['users', { role: 1, status: 1, created_at: -1 }, { name: 'user_management_role_status_created' }],
  ['users', { deleted_at: 1 }, { name: 'user_management_deleted_at', partialFilterExpression: { deleted_at: { $exists: true } } }],
  ['instructor_profiles', { user_id: 1 }, {
    name: 'instructor_profiles_user_id_unique',
    unique: true,
    partialFilterExpression: { user_id: { $type: 'string' } },
  }],
  ['instructor_profiles', { status: 1, legal_status: 1, created_at: -1 }, { name: 'instructor_profiles_review_status' }],
  ['instructor_applications', { user_id: 1, status: 1, created_at: -1 }, { name: 'instructor_applications_user_status_created' }],
  ['user_sessions', { user_id: 1, revoked_at: 1, expires_at: 1 }, { name: 'user_sessions_user_revoked_expiry' }],
  ['courses', { instructor_id: 1, admin_hidden: 1 }, { name: 'courses_instructor_visibility' }],
  ['admin_audit_logs', { 'details.entity.type': 1, 'details.entity.id': 1, created_at: -1 }, { name: 'admin_audit_entity_created' }],
  ['admin_user_evidence', { owner_user_id: 1, linked_at: 1 }, { name: 'admin_user_evidence_owner_linked' }],
  ['admin_user_email_outbox', { status: 1, next_attempt_at: 1, lease_until: 1 }, { name: 'admin_user_email_retry' }],
];

export const ACTIVE_VERIFIED_USER_FILTER = {
  role: { $in: ['student', 'instructor'] },
  status: 'active',
  deleted_at: { $exists: false },
  email_verified: { $exists: false },
  email_verified_at: { $exists: true, $nin: [null, ''] },
  $expr: {
    $ne: [
      { $convert: { input: '$email_verified_at', to: 'date', onError: null, onNull: null } },
      null,
    ],
  },
};

export const ACTIVE_USER_FLAG_FILTER = {
  role: { $in: ['student', 'instructor'] },
  status: 'active',
  deleted_at: { $exists: false },
  is_active: { $exists: false },
};

export const UNLINKED_INSTRUCTOR_FILTER = {
  deleted_at: { $exists: false },
  user_id: { $exists: false },
  account_link_status: { $ne: 'needs_reconciliation' },
};

export async function inspectUserManagementMigration(db) {
  const profiles = db.collection('instructor_profiles');
  const duplicateLinks = await profiles.aggregate([
    { $match: { user_id: { $type: 'string' }, deleted_at: { $exists: false } } },
    { $group: { _id: '$user_id', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'duplicates' },
  ]).toArray();
  if (duplicateLinks[0]?.duplicates) {
    throw new Error('Có liên kết instructor_profiles.user_id trùng; dừng migration để đối soát thủ công.');
  }

  const users = db.collection('users');
  const [verifiedAtEligible, activeFlagEligible, unlinkedProfiles] = await Promise.all([
    users.countDocuments(ACTIVE_VERIFIED_USER_FILTER),
    users.countDocuments(ACTIVE_USER_FLAG_FILTER),
    profiles.countDocuments(UNLINKED_INSTRUCTOR_FILTER),
  ]);
  return {
    database: db.databaseName,
    indexesToEnsure: USER_MANAGEMENT_INDEXES.length,
    safeBackfills: { emailVerifiedFromTimestamp: verifiedAtEligible, isActiveFromActiveStatus: activeFlagEligible },
    instructorProfilesNeedingIdentityReconciliation: unlinkedProfiles,
  };
}

export async function applyUserManagementMigration(db, report) {
  for (const [collectionName, keys, options] of USER_MANAGEMENT_INDEXES) {
    await db.collection(collectionName).createIndex(keys, options);
  }

  const now = new Date();
  const emailVerified = await db.collection('users').updateMany(ACTIVE_VERIFIED_USER_FILTER, {
    $set: { email_verified: true, updated_at: now },
  });
  const activeFlags = await db.collection('users').updateMany(ACTIVE_USER_FLAG_FILTER, {
    $set: { is_active: true, updated_at: now },
  });
  const linkMarkers = await db.collection('instructor_profiles').updateMany(UNLINKED_INSTRUCTOR_FILTER, {
    $set: { account_link_status: 'needs_reconciliation', updated_at: now },
  });

  const migrationAudit = db.collection('admin_audit_logs');
  const alreadyAudited = await migrationAudit.findOne({
    action: 'USER_MANAGEMENT_SCHEMA_V1_BACKFILL',
    'details.entity.id': 'user-management-schema-v1',
  }, { projection: { _id: 1 } });
  if (!alreadyAudited) {
    await migrationAudit.insertOne({
      admin_id: null,
      action: 'USER_MANAGEMENT_SCHEMA_V1_BACKFILL',
      ip: 'migration',
      user_agent: 'migrate-user-management-schema',
      details: {
        entity: { type: 'system', id: 'user-management-schema-v1' },
        metadata: {
          indexesEnsured: USER_MANAGEMENT_INDEXES.length,
          emailVerifiedFromTimestamp: emailVerified.modifiedCount,
          isActiveFromActiveStatus: activeFlags.modifiedCount,
          instructorProfilesMarkedForReconciliation: linkMarkers.modifiedCount,
          unlinkedProfilesBeforeApply: report.instructorProfilesNeedingIdentityReconciliation,
        },
      },
      created_at: now,
    });
  }

  return {
    indexesEnsured: USER_MANAGEMENT_INDEXES.length,
    emailVerifiedFromTimestamp: emailVerified.modifiedCount,
    isActiveFromActiveStatus: activeFlags.modifiedCount,
    instructorProfilesMarkedForReconciliation: linkMarkers.modifiedCount,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const configuredDbName = process.env.MONGODB_DB_NAME || REQUIRED_DB_NAME;
  if (configuredDbName !== REQUIRED_DB_NAME) {
    throw new Error(`Từ chối chạy: MONGODB_DB_NAME phải là ${REQUIRED_DB_NAME}.`);
  }

  const db = await getMongoDb(undefined, configuredDbName);
  const report = await inspectUserManagementMigration(db);
  if (!apply) {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', ...report })}\n`);
    return;
  }

  const result = await applyUserManagementMigration(db, report);
  process.stdout.write(`${JSON.stringify({ mode: 'apply', ...report, result })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }).finally(() => closeMongoDb());
}
