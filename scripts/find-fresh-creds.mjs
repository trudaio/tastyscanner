// DISABLED 2026-04-30
//
// This script previously iterated every user in Firestore and dumped their
// TastyTrade clientSecret / refreshToken / accessToken to stdout, sorted by
// "freshness". See scripts/fetch-credentials.mjs for the full reasoning.
//
// Kept as a tombstone (not deleted) so anyone who tries to run it from muscle
// memory or shell history sees this notice.

console.error('find-fresh-creds.mjs is permanently disabled.');
console.error('It iterated every user in Firestore to rank TastyTrade');
console.error('credentials by freshness. Use Catalin\'s broker account directly.');
process.exit(1);
