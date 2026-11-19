# Security Specification — AgendaPlan Pro

## 1. Data Invariants
1. **User Profile (`/users/{userId}`)**: Only the verified owner (`request.auth.uid == userId && request.auth.token.email_verified == true`) or bootstrapped admin (`marktingdigitalwills@gmail.com` verified) can read or write their profile containing PII (`email`, `whatsappNumber`).
2. **Services (`/services/{serviceId}`)**: A service cannot exist without a valid `ownerId == request.auth.uid`, valid `price >= 0`, and string size limits. Services contain no PII, allowing authenticated reading or active service lookup by `serviceId`. Only the owner can create, update, or delete their services.
3. **Bookings (`/bookings/{bookingId}`)**: Contains client PII (`clientName`, `clientPhone`, `serviceAddress`). Read (`get`, `list`), create, update, and delete are strictly restricted to the verified `ownerId` (or verified admin). Terminal state locking prevents modifications once `status == 'finalizado'` or `'cancelado'` unless performed by verified admin.
4. **Confirmation Tickets (`/confirmations/{confirmToken}`)**: Contains zero PII. Only the unguessable `confirmToken` document can be fetched via `get` (no `list`). Authenticated verified users or the owner can create/update; client confirmation updates ONLY transition `status` from `'pendente'` to `'finalizado'` with strict `affectedKeys().hasOnly(['status', 'updatedAt'])` and server timestamp `request.time`.
5. **Booking Requests (`/bookingRequests/{requestId}`)**: Created when a client books through the portal; read, list, update (`processed`), and delete are strictly restricted to the verified `ownerId` so client PII is never exposed to other users.
6. **Custom Spreadsheets (`/spreadsheets/{sheetId}` and `/spreadsheets/{sheetId}/rows/{rowId}`)**: Strictly owned by `ownerId == request.auth.uid`. Subcollection `/rows/{rowId}` enforces the Master Gate pattern by verifying parent spreadsheet ownership via `get(/databases/$(database)/documents/spreadsheets/$(sheetId)).data.ownerId == request.auth.uid`.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated User Profile Read**: `GET /users/user123` without auth -> Denied.
2. **Shadow Field Injection on Service Create**: `CREATE /services/s1` with `{ ...validService, isAdmin: true }` -> Denied by `hasOnly`.
3. **Cross-Tenant Service Update**: `UPDATE /services/s1` where `existing().ownerId != request.auth.uid` -> Denied.
4. **Unverified Email Write**: `CREATE /bookings/b1` where `request.auth.token.email_verified == false` -> Denied.
5. **PII Blanket List on Bookings**: `LIST /bookings` without `where('ownerId', '==', auth.uid)` -> Denied by `resource.data.ownerId == request.auth.uid`.
6. **Client Address & Phone Read by Stranger**: `GET /bookings/b1` as another signed-in user -> Denied.
7. **Post-Finalization Mutation**: `UPDATE /bookings/b1` when `existing().status == 'finalizado'` by non-admin -> Denied by terminal state lock.
8. **ID Poisoning**: `CREATE /services/<1500-char-id>` -> Denied by `isValidId()`.
9. **Spoofed Server Timestamp**: `CREATE /bookings/b1` with client-provided past `createdAt` -> Denied by `incoming().createdAt == request.time`.
10. **Immutable Owner Tampering**: `UPDATE /spreadsheets/sh1` changing `ownerId` -> Denied by `incoming().ownerId == existing().ownerId`.
11. **Orphaned Spreadsheet Row**: `CREATE /spreadsheets/nonexistent/rows/r1` -> Denied by Master Gate `get()` on parent sheet.
12. **Confirmation Ticket Enumeration**: `LIST /confirmations` -> Denied (`allow list: if false`).
