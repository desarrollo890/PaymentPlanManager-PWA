import test from 'node:test';
import assert from 'node:assert/strict';
import { createProbeServer } from './server.mjs';
import { DriveProbeClient, validatePacket, DRIVE_SCOPE } from './drive-probe.mjs';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function fakeDrive() {
  const files = [], requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    assert.equal(options.redirect, 'error');
    if (options.method === 'POST') {
      const boundary = options.headers['Content-Type'].split('boundary=')[1];
      const parts = options.body.split(`--${boundary}`);
      const metadata = JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
      const encrypted = JSON.parse(parts[2].split('\r\n\r\n')[1].trim());
      assert.deepEqual(metadata.parents, ['appDataFolder']);
      assert.equal(metadata.mimeType, 'application/json');
      assert(!options.body.includes('Synthetic F0 Google interoperability probe'), 'Upload must contain ciphertext, not cleartext');
      const file = { id: 'synthetic_file_' + (files.length + 1), name: metadata.name, encrypted };
      files.push(file); return json({ id: file.id, name: file.name });
    }
    const parsed = new URL(url);
    if (parsed.searchParams.get('alt') === 'media') {
      const file = files.find(f => f.id === parsed.pathname.split('/').at(-1));
      return file ? json(file.encrypted) : json({}, 404);
    }
    assert.equal(parsed.searchParams.get('spaces'), 'appDataFolder');
    const index = Number(parsed.searchParams.get('pageToken') || 0);
    return json({ files: files.slice(index, index + 1).map(({ id, name }) => ({ id, name })),
      ...(index + 1 < files.length ? { nextPageToken: String(index + 1) } : {}) });
  };
  return { client: new DriveProbeClient(() => 'synthetic-token', fetcher), files, requests };
}

test('probe creates only encrypted synthetic batches, lists every appdata page and verifies them', async () => {
  const remote = fakeDrive(), first = await remote.client.create(), second = await remote.client.create();
  validatePacket(first); validatePacket(second);
  assert.notEqual(first.blockId, second.blockId); assert.notEqual(first.syntheticKeyBase64, second.syntheticKeyBase64);
  assert.deepEqual(await remote.client.verify(first), { fileId: first.fileId, blockId: first.blockId, integrityVerified: true, synthetic: true });
  assert.equal((await remote.client.list()).length, 2);
  assert.equal(remote.files[0].encrypted.ivBase64.length, 16);
  assert.equal(DRIVE_SCOPE, 'https://www.googleapis.com/auth/drive.appdata');
});
test('wrong identity, altered ciphertext or mismatched hash cannot pass interoperability verification', async () => {
  const remote = fakeDrive(), packet = await remote.client.create();
  await assert.rejects(remote.client.verify({ ...packet, plaintextSha256: '0'.repeat(64) }), /no coincide/);
  remote.files[0].encrypted.vaultId = crypto.randomUUID();
  await assert.rejects(remote.client.verify(packet), /identity mismatch/);
  remote.files[0].encrypted.vaultId = packet.vaultId;
  const encrypted = remote.files[0].encrypted;
  encrypted.ciphertextBase64 = (encrypted.ciphertextBase64[0] === 'A' ? 'B' : 'A') + encrypted.ciphertextBase64.slice(1);
  await assert.rejects(remote.client.verify(packet));
  assert.throws(() => validatePacket({ ...packet, synthetic: false }), /inválido/);
  assert.throws(() => validatePacket({ ...packet, fileId: '../real-data' }), /inválido/);
});
test('missing authorization, denied access and looping pagination fail without exposing token or response body', async () => {
  let calls = 0;
  const missing = new DriveProbeClient(() => null, async () => { calls++; return json({}); });
  await assert.rejects(missing.list(), /Autoriza/); assert.equal(calls, 0);
  for (const status of [401, 403, 404, 429, 500]) {
    const client = new DriveProbeClient(() => 'synthetic-private-token', async () => json({ error: 'synthetic-private-token' }, status));
    await assert.rejects(client.list(), error => !error.message.includes('synthetic-private-token'));
  }
  const looping = new DriveProbeClient(() => 'synthetic-token', async () => json({ files: [], nextPageToken: 'same' }));
  await assert.rejects(looping.list(), /Paginación/);
});
test('local server serves only explicit assets and public Client ID with no token or secret endpoint', async () => {
  const server = createProbeServer('123-synthetic.apps.googleusercontent.com');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const config = await fetch(url + '/config.json'); assert.equal(config.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await config.json(), { clientId: '123-synthetic.apps.googleusercontent.com' });
    for (const route of ['/', '/main.mjs', '/drive-probe.mjs', '/architecture/crypto-proof.mjs']) assert.equal((await fetch(url + route)).status, 200);
    assert.equal((await fetch(url + '/.env.local')).status, 404);
    assert.equal((await fetch(url + '/config.json', { method: 'POST', body: 'synthetic-token' })).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
  assert.throws(() => createProbeServer('client-secret'), /Invalid/);
});
