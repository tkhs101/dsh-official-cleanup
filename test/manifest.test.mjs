// Publishable-identity guards. These are the invariants a rename can silently
// break: the patch row's `name` is the specifier the Loader imports, and the
// declared client modules must exist. Run with `npm test`.
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');

const pkg = JSON.parse(read('package.json'));
const patch = read('cordis.patch.yml');

/** The `name:` of the row this bundle inserts (the module the Loader imports). */
function insertedRowName(yaml) {
  const insertAt = yaml.indexOf('- insert:');
  assert.notEqual(insertAt, -1, 'cordis.patch.yml has no insert block');
  const tail = yaml.slice(insertAt);
  const match = /^\s*name:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(tail);
  assert.notEqual(match, null, 'the insert row has no name');
  return match[1];
}

test('the patch row imports this package by its own name', () => {
  assert.equal(insertedRowName(patch), pkg.name);
});

test('the patch row id matches the plugin name the Host half exports', () => {
  const host = read('index.js');
  const declared = /export const name = ['"]([^'"]+)['"]/.exec(host);
  assert.notEqual(declared, null, 'index.js does not export a plugin name');
  // The row id is ours to choose; it must simply stay stable for patches.
  const rowId = /^\s*-\s*id:\s*(\S+)\s*$/m.exec(patch.slice(patch.indexOf('- insert:')));
  assert.notEqual(rowId, null, 'the insert row has no id');
  assert.equal(rowId[1], 'official-cleanup');
  assert.equal(declared[1], 'dsh-official-cleanup');
});

test('a version mismatch is refused by the harness gate, not a crash', () => {
  assert.equal(typeof pkg.engines?.dsh, 'string');
  assert.match(pkg.engines.dsh, /^>=/);
});

test('the declared client modules are the ones a web profile serves', () => {
  assert.equal(pkg.dsh?.client?.platform, 'web');
  assert.ok(Array.isArray(pkg.dsh.client.inject) && pkg.dsh.client.inject.length > 0);
  for (const id of pkg.dsh.client.inject) assert.match(id, /^@deepseek-ai\/dsh-client-/);
});

test('the client bundle registers under this package name', () => {
  // The web loader matches each served bundle by package name, so a rename
  // that misses this line fails the whole boot ("loaded without registering").
  const client = read('client.js');
  const registered = /__ModuleLoader__\.load\(\{\s*id:\s*['"]([^'"]+)['"]/.exec(client);
  assert.notEqual(registered, null, 'client.js does not register via __ModuleLoader__.load');
  assert.equal(registered[1], pkg.name);
});

test('every shipped path exists and is declared', () => {
  for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'README.md', 'LICENSE']) {
    assert.ok(existsSync(new URL(file, root)), `${file} is missing`);
    assert.ok(pkg.files.includes(file) || file === 'LICENSE', `${file} is not in package.json files`);
  }
  for (const locale of ['en', 'zh']) {
    const meta = JSON.parse(read(`locale/${locale}.json`));
    assert.equal(typeof meta.meta?.title, 'string');
    assert.equal(typeof meta.meta?.description, 'string');
  }
});
