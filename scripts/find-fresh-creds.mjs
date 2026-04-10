import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function findFreshCreds() {
  const usersSnap = await db.collection('users').get();
  console.log(`Scanning ${usersSnap.size} users...`);

  const allCreds = [];

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const brokerSnap = await db.collection('users').doc(uid).collection('brokerAccounts').get();
    if (brokerSnap.empty) continue;

    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      const cs  = data?.credentials?.clientSecret  || data?.clientSecret  || null;
      const rt  = data?.credentials?.refreshToken  || data?.refreshToken  || null;
      const at  = data?.credentials?.accessToken   || data?.accessToken   || null;
      const active = data?.isActive ?? true;
      const upd = brokerDoc.updateTime?.seconds || 0;

      if (cs || rt || at) {
        allCreds.push({ uid, brokerId: brokerDoc.id, clientSecret: cs, refreshToken: rt, accessToken: at, isActive: active, updatedAt: upd, allKeys: Object.keys(data).join(', '), credKeys: data.credentials ? Object.keys(data.credentials).join(', ') : '(none)' });
      }
    }
  }

  // Sort by update time desc (most recent first)
  allCreds.sort((a, b) => b.updatedAt - a.updatedAt);
  console.log(`\nFound ${allCreds.length} broker accounts with credentials:\n`);
  for (const c of allCreds) {
    console.log(`uid: ${c.uid.slice(0,12)}... broker: ${c.brokerId.slice(0,12)}... updatedAt: ${new Date(c.updatedAt*1000).toISOString()} active: ${c.isActive}`);
    console.log(`  docKeys: ${c.allKeys}  |  credKeys: ${c.credKeys}`);
    console.log(`  clientSecret: ${c.clientSecret ? c.clientSecret.slice(0,8)+'...' : '[none]'}`);
    console.log(`  refreshToken: ${c.refreshToken ? c.refreshToken.slice(0,30)+'...' : '[none]'}`);
    console.log(`  accessToken:  ${c.accessToken  ? c.accessToken.slice(0,30)+'...'  : '[none]'}`);
    console.log();
  }
}

findFreshCreds()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
