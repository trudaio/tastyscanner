// DISABLED 2026-04-30
//
// This script previously iterated every user in Firestore and tried each
// user's TastyTrade refresh_token against the OAuth endpoint to find a
// working one. See scripts/fetch-credentials.mjs for the full reasoning.
//
// Kept as a tombstone (not deleted) so anyone who tries to run it from muscle
// memory or shell history sees this notice.

console.error('try-creds.mjs is permanently disabled.');
console.error('It tried every user\'s TastyTrade refresh token against the');
console.error('OAuth endpoint. Use Catalin\'s broker account directly.');
process.exit(1);
