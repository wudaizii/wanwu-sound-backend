// One-time patch for the deployed H5 whose main branch predates its account UI.
// Source changes are in frontend-password-policy-20261124.patch. Never rebuild
// the whole deployed site from that older checkout. This changes only validation
// and two messages, and gives affected modules new URLs to invalidate caches.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const [input, output] = process.argv.slice(2).map((p) => resolve(p));
if (!input || !output || input === output) throw new Error('Separate input/output directories required');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const files = new Map();
for (const name of (await readdir(join(input, 'assets'))).filter((n) => /^[\w-]+\.js$/.test(n)))
  files.set(name, await readFile(join(input, 'assets', name), 'utf8'));
const original = new Map(files);
const pins = {
  'account-HXEU-tng.js': '78ac87cad2e3d2eb2bf5a4ec0c3462bb84efd2352878bf7fba65e1132c678114',
  'useAccountForm-B3hqHEDx.js': '4648618a0e230d86851bad5f0f478e25e27f724253f3be4bd32be0a031ed2f05',
};
for (const [name, hash] of Object.entries(pins))
  if (sha(files.get(name) ?? '') !== hash) throw new Error('Deployed account module changed; review again');
function replace(name, from, to) {
  const text = files.get(name);
  if (text.split(from).length !== 2) throw new Error('Expected exactly one reviewed replacement');
  files.set(name, text.replace(from, to));
}
replace('account-HXEU-tng.js',
  'function o(e){return typeof e==`string`&&!/[\\uD800-\\uDFFF]/u.test(e)&&[...e].length>=15&&[...e].length<=128}',
  'function o(e){return typeof e==`string`&&!/[\\uD800-\\uDFFF]/u.test(e)&&[...e].length>=12&&[...e].length<=128&&/\\p{Lu}/u.test(e)&&/\\p{Ll}/u.test(e)&&/\\p{Nd}/u.test(e)&&/[\\p{P}\\p{S}]/u.test(e)}');
replace('useAccountForm-B3hqHEDx.js',
  '15–128 个字符，可用空格和中文；无需按“大小写＋符号”组合。',
  '至少 12 个字符，包含大写字母、小写字母、数字和特殊字符；可使用中文和空格。');
replace('useAccountForm-B3hqHEDx.js',
  '新密码须为 15–128 个字符，可以使用空格和中文。',
  '新密码须至少 12 个字符，并包含大写字母、小写字母、数字和特殊字符。');
const affected = new Set(Object.keys(pins));
for (;;) {
  const before = affected.size;
  for (const [name, text] of files)
    if ([...affected].some((dependency) => text.includes(dependency))) affected.add(name);
  if (affected.size === before) break;
}
const mapping = new Map([...affected].map((name) => [name,
  name.slice(0, -3) + '-pw' + sha(original.get(name) + '\nwanwu-password-policy-20261124-v1').slice(0, 10) + '.js']));
function imports(text) {
  for (const [from, to] of mapping) text = text.replaceAll(from, to);
  return text;
}
await mkdir(join(output, 'assets'), { recursive: true });
const changes = [];
for (const name of affected) {
  const text = imports(files.get(name));
  const file = mapping.get(name);
  await writeFile(join(output, 'assets', file), text);
  changes.push({ from: 'assets/' + name, to: 'assets/' + file, before: sha(original.get(name)), after: sha(text) });
}
const html = await readFile(join(input, 'index.html'), 'utf8');
const nextHtml = imports(html);
if (html === nextHtml) throw new Error('HTML must reference a fresh entry module');
await writeFile(join(output, 'index.html'), nextHtml);
const proof = { format: 1, scope: 'password-validation-and-hints', htmlBefore: sha(html), htmlAfter: sha(nextHtml), changes };
await writeFile(join(output, 'manifest.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ status: 'pass', patchedBusinessModules: 2, freshModuleUrls: affected.size, htmlChanged: true }));
