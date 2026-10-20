import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 既存版を独立した参照実装として実行し、判定規則が変わっていないことを確認
const root = new URL('../', import.meta.url);
const baseline = execFileSync('git', ['show', '2067c3b:index.html'], { cwd: fileURLToPath(root), encoding: 'utf8' });
const referenceSource = baseline.match(/<script>([\s\S]*?)<\/script>/)[1].split('    function columnLabel')[0];
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const workerSource = html.match(/const workerSource = String\.raw`([\s\S]*?)`;/)[1];

test('100組の表で既存版の全セル・分類・件数と一致', () => {
  let seed = 715;
  const random = maximum => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % maximum; };
  const samples = ['001', '1', '2026/1/2', '2026-1-3', ' a  b', 'a b', '', '日本語', '<img>', '"quoted"', '999999999999999999'];
  const makeTable = () => Array.from({ length: random(30) + 1 }, () => Array.from({ length: random(8) + 1 }, () => samples[random(samples.length)]).join('\t')).join(random(2) ? '\r\n' : '\n') + '\n末尾';
  for (let index = 0; index < 100; index++) {
    const a = makeTable(), b = makeTable();
    const inputs = { '#inputA': { value: a }, '#inputB': { value: b } };
    const reference = vm.createContext({ document: { querySelector: selector => inputs[selector] } });
    vm.runInContext(referenceSource, reference);
    const expected = vm.runInContext('buildComparison()', reference);
    let messages = [];
    const worker = vm.createContext({ postMessage: message => messages.push(message) });
    vm.runInContext(workerSource, worker);
    worker.onmessage({ data: { type: 'compare', revision: 1, a, b } });
    const actual = messages[0];
    for (const key of ['rowCount', 'colCount', 'changedCells', 'added', 'removed', 'leadingZero']) assert.equal(actual[key], expected[key], `${index}: ${key}`);
    assert.equal(actual.changedRowCount, expected.changedRows.size);
    messages = [];
    worker.onmessage({ data: { type: 'viewport', revision: 1, token: 1, mode: 'all', rowStart: 0, rowEnd: expected.rowCount, colStart: 0, colEnd: expected.colCount } });
    const view = messages[0];
    const plain = value => JSON.parse(JSON.stringify(value));
    assert.deepEqual(plain(view.rows.map(row => row.a)), plain(expected.gridA));
    assert.deepEqual(plain(view.rows.map(row => row.b)), plain(expected.gridB));
    assert.deepEqual(plain(view.rows.map(row => row.categories)), plain(expected.categories));
  }
});
