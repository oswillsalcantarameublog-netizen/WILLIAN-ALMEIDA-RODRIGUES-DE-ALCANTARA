/**
 * Security Rule Invariant Verification Suite (Dirty Dozen)
 * Validates rule invariants defined in security_spec.md against firestore.rules.
 */
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

interface RuleAssertion {
  name: string;
  check: () => boolean;
}

const assertions: RuleAssertion[] = [
  {
    name: '01. Global default-deny safety net present',
    check: () => rulesContent.includes('match /{document=**} {\n      allow read, write: if false;\n    }'),
  },
  {
    name: '02. Email verification gate enforced via isVerified()',
    check: () => rulesContent.includes('request.auth.token.email_verified == true'),
  },
  {
    name: '03. Path variable hardening isValidId() applied',
    check: () => rulesContent.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"),
  },
  {
    name: '04. User profile PII strictly restricted to owner or admin',
    check: () =>
      rulesContent.includes('match /users/{userId}') &&
      rulesContent.includes('allow get: if isValidId(userId) && (isOwnerId(userId) || isAdmin());'),
  },
  {
    name: '05. Bookings PII list query enforces resource.data.ownerId',
    check: () =>
      rulesContent.includes('allow list: if isVerified() && (resource.data.ownerId == request.auth.uid || isAdmin());'),
  },
  {
    name: '06. Bookings terminal state lock prevents post-finalization edits by non-admin',
    check: () =>
      rulesContent.includes("existing().status in ['agendado', 'em_andamento'] || isAdmin()"),
  },
  {
    name: '07. Confirmations enforce pendente -> finalizado transition only',
    check: () =>
      rulesContent.includes("existing().status == 'pendente'") &&
      rulesContent.includes("incoming().status == 'finalizado'") &&
      rulesContent.includes("incoming().diff(existing()).affectedKeys().hasOnly(['status', 'updatedAt'])"),
  },
  {
    name: '08. Confirmations creation enforces existsAfter atomicity on parent booking',
    check: () =>
      rulesContent.includes('existsAfter(/databases/$(database)/documents/bookings/$(incoming().bookingId))'),
  },
  {
    name: '09. Spreadsheet rows enforce Master Gate parent ownership lookup',
    check: () =>
      rulesContent.includes('get(/databases/$(database)/documents/spreadsheets/$(sheetId)).data.ownerId == request.auth.uid'),
  },
  {
    name: '10. Temporal integrity validates createdAt and updatedAt against request.time',
    check: () =>
      rulesContent.includes('incoming().createdAt == request.time') &&
      rulesContent.includes('incoming().updatedAt == request.time'),
  },
  {
    name: '11. Shadow fields blocked via hasAll and hasOnly in validation helpers',
    check: () =>
      rulesContent.includes('data.keys().hasAll(') && rulesContent.includes('data.keys().hasOnly('),
  },
  {
    name: '12. Immutable ownerId enforced on updates',
    check: () => rulesContent.includes('incoming().ownerId == existing().ownerId'),
  },
  {
    name: '13. Public profiles expose single-doc get without PII list access',
    check: () =>
      rulesContent.includes('match /publicProfiles/{userId}') &&
      rulesContent.includes('allow get: if isValidId(userId);') &&
      rulesContent.includes('allow list: if isAdmin();'),
  },
  {
    name: '14. Library sheets enforce native array validation on headers and values',
    check: () =>
      rulesContent.includes('data.headers is list && data.headers.size() >= 1 && data.headers.size() <= 25 && data.headers[0] is string') &&
      rulesContent.includes('data.values is list && data.values.size() >= 1 && data.values.size() <= 25 && data.values[0] is string'),
  },
  {
    name: '15. Library sheet items enforce Master Gate via getAfter/get on parent librarySheets doc',
    check: () =>
      rulesContent.includes('getAfter(/databases/$(database)/documents/librarySheets/$(sheetId)).data.ownerId == request.auth.uid') &&
      rulesContent.includes('get(/databases/$(database)/documents/librarySheets/$(sheetId)).data.ownerId == request.auth.uid'),
  },
];

let failed = 0;
for (const a of assertions) {
  if (!a.check()) {
    console.error(`FAIL: ${a.name}`);
    failed++;
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log(`All ${assertions.length} Firestore security rule invariants verified.`);
