// DISABLED 2026-04-30
//
// This script previously iterated every user in Firestore and printed their
// TastyTrade clientSecret + refreshToken to stdout. It was used during
// development to "find a working credential" — which in practice meant
// hijacking the OAuth grant of whichever app user had logged in most recently.
//
// That behavior:
//   - violated the consent of other app users,
//   - very likely violated TastyTrade's API ToS,
//   - and consumed those users' DxLink subscription quota, triggering the
//     "DxLink subscription limit exceeded" warning email from TastyTrade.
//
// Kept as a tombstone (not deleted) so anyone who tries to run it from muscle
// memory or shell history sees this notice. To work with Catalin's own
// TastyTrade credentials, use the broker UI in the app (which writes to
// users/<catalin-uid>/brokerAccounts) and read from there in the scanner.

console.error('fetch-credentials.mjs is permanently disabled.');
console.error('It iterated every user in Firestore to harvest TastyTrade');
console.error('credentials. Use Catalin\'s broker account directly instead.');
process.exit(1);
