import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(sa),
});

const db = admin.firestore();

async function fetchTastyCredentials() {
  console.log('Querying Firestore users collection...');
  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.size} user(s).`);

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    console.log(`\nChecking user: ${uid}`);

    const brokerSnap = await db
      .collection('users')
      .doc(uid)
      .collection('brokerAccounts')
      .get();

    if (brokerSnap.empty) {
      console.log('  No brokerAccounts subcollection.');
      continue;
    }

    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      console.log(`  Broker doc: ${brokerDoc.id}`);
      console.log(`  Keys: ${Object.keys(data).join(', ')}`);

      const clientId = data?.credentials?.clientId || data?.clientId || null;
      const clientSecret = data?.credentials?.clientSecret || data?.clientSecret || null;
      const refreshToken = data?.credentials?.refreshToken || data?.refreshToken || null;
      const username = data?.credentials?.username || data?.username || null;
      const password = data?.credentials?.password || data?.password || null;

      console.log(`  clientId: ${clientId ? '[present]' : '[missing]'}`);
      console.log(`  clientSecret: ${clientSecret ? '[present]' : '[missing]'}`);
      console.log(`  refreshToken: ${refreshToken ? '[present]' : '[missing]'}`);
      console.log(`  username: ${username ? username : '[missing]'}`);
      console.log(`  password: ${password ? '[present]' : '[missing]'}`);

      // Output full creds to stdout as JSON for consumption
      if ((clientSecret && refreshToken) || (username && password)) {
        const result = { uid, brokerId: brokerDoc.id, clientId, clientSecret, refreshToken, username, password };
        console.log('\nCREDENTIALS_JSON:' + JSON.stringify(result));
        process.exit(0);
      }
    }
  }

  console.error('No usable TastyTrade credentials found.');
  process.exit(1);
}

fetchTastyCredentials().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
