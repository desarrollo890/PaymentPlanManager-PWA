// CI-only Linux SDK bootstrap from Google's checksum-verified repository archives.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'linux' || !process.env.RUNNER_TEMP) throw Error('This bootstrap is for the Android CI runner. Install the SDK locally using Android Studio.');
const root = path.resolve(process.env.RUNNER_TEMP, 'paymentplan-android-sdk');
const target = path.resolve(root, 'sdk');
fs.mkdirSync(root, { recursive: true });
const repository = 'https://dl.google.com/android/repository/';
const response = await fetch(repository + 'repository2-3.xml', { signal: AbortSignal.timeout(60000) });
if (!response.ok) throw Error(`Google SDK metadata HTTP ${response.status}`);
const xml = await response.text();
const packages = [...xml.matchAll(/<remotePackage path="cmdline-tools;([\d.]+)"[\s\S]*?<\/remotePackage>/g)]
  .filter(m => m[0].includes('channel-0')).sort((a,b) => Number(b[1]) - Number(a[1]));
const archive = [...(packages[0]?.[0] ?? '').matchAll(/<archive>[\s\S]*?<\/archive>/g)].find(m => m[0].includes('<host-os>linux</host-os>'))?.[0];
if (!archive) throw Error('Stable Linux Android command-line tools not found.');
const filename = archive.match(/<url>([^<]+)<\/url>/)?.[1];
const checksum = archive.match(/<checksum type="sha1">([^<]+)<\/checksum>/)?.[1];
const size = Number(archive.match(/<size>(\d+)<\/size>/)?.[1]);
if (!filename?.match(/^commandlinetools-linux-\d+_latest.zip$/) || !checksum || !size || size > 500_000_000) throw Error('Unexpected Android SDK archive metadata.');
const tools = await fetch(repository + filename, { signal: AbortSignal.timeout(180000) });
if (!tools.ok) throw Error(`Google SDK tools HTTP ${tools.status}`);
const bytes = Buffer.from(await tools.arrayBuffer());
if (bytes.length !== size || createHash('sha1').update(bytes).digest('hex') !== checksum) throw Error('Android SDK tools checksum mismatch.');
const zip = path.join(root, 'commandline-tools.zip'), extracted = path.join(root, 'extract');
fs.writeFileSync(zip, bytes);
const unzip = spawnSync('unzip', ['-q', zip, '-d', extracted], { stdio: 'inherit' });
if (unzip.status !== 0) throw Error('SDK extraction failed.');
fs.mkdirSync(path.join(target, 'cmdline-tools'), { recursive: true });
fs.renameSync(path.join(extracted, 'cmdline-tools'), path.join(target, 'cmdline-tools', 'latest'));
const manager = path.join(target, 'cmdline-tools', 'latest', 'bin', 'sdkmanager');
const license = spawnSync(manager, [`--sdk_root=${target}`, '--licenses'], { input: 'y\n'.repeat(100), encoding: 'utf8', timeout: 180000 });
if (license.status !== 0) throw Error('Android SDK license setup failed.');
const installed = spawnSync(manager, [`--sdk_root=${target}`, 'platforms;android-36', 'build-tools;36.0.0'], { stdio: 'inherit', timeout: 300000 });
if (installed.status !== 0) throw Error('Android SDK installation failed.');
fs.appendFileSync(process.env.GITHUB_ENV, `ANDROID_HOME=${target}\nANDROID_SDK_ROOT=${target}\n`);
console.log('PASS: official Android SDK installed with checked tools archive, API 36 and build tools 36.0.0.');
