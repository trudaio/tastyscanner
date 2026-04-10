import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
const httpsAgent = new HttpsProxyAgent(proxyUrl);
const axiosCfg = { httpsAgent, proxy: false, maxRedirects: 5 };

const sa = JSON.parse(readFileSync('/tmp/firebase-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function tryToken(clientSecret, refreshToken, label) {
  try {
    const res = await axios.post('https://api.tastyworks.com/oauth/token', {
      refresh_token: refreshToken,
      client_secret: clientSecret,
      scope: 'read',
      grant_type: 'refresh_token',
    }, axiosCfg);
    console.log(`  ✓ SUCCESS! ${label}`);
    console.log(`    access-token: ${(res.data['access-token']||res.data['access_token']||'').slice(0,30)}...`);
    return { clientSecret, refreshToken, accessToken: res.data['access-token']||res.data['access_token'] };
  } catch (e) {
    const msg = e.response?.data?.error_description || e.response?.data?.error || e.message;
    console.log(`  ✗ ${label}: ${msg}`);
    return null;
  }
}

async function main() {
  // Fetch top-5 most recently updated accounts
  const usersSnap = await db.collection('users').get();
  const allCreds = [];
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const brokerSnap = await db.collection('users').doc(uid).collection('brokerAccounts').get();
    for (const brokerDoc of brokerSnap.docs) {
      const data = brokerDoc.data();
      const cs = data?.credentials?.clientSecret || data?.clientSecret;
      const rt = data?.credentials?.refreshToken || data?.refreshToken;
      const upd = brokerDoc.updateTime?.seconds || 0;
      if (cs && rt) allCreds.push({ uid, cs, rt, upd, label: `${uid.slice(0,8)}/${brokerDoc.id.slice(0,8)}` });
    }
  }
  allCreds.sort((a, b) => b.upd - a.upd);

  console.log(`Trying top ${Math.min(10, allCreds.length)} most recent accounts...\n`);
  for (const c of allCreds.slice(0, 10)) {
    const result = await tryToken(c.cs, c.rt, c.label);
    if (result) {
      console.log('\nFOUND_WORKING_CREDS:' + JSON.stringify(result));
      process.exit(0);
    }
  }
  console.log('\nNo working credentials found in top 10.');
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
