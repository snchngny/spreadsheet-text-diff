import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/const workerSource = String\.raw`([\s\S]*?)`;/)[1];
const main = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(main);

function engine() {
  const messages = [];
  const context = vm.createContext({ postMessage: message => messages.push(message) });
  vm.runInContext(source, context);
  return message => {
    messages.length = 0;
    context.onmessage({ data: message });
    return JSON.parse(JSON.stringify(messages));
  };
}

test('文字列、空白、先頭ゼロ、日付、空欄の分類と集計を維持', () => {
  const send = engine();
  const a = 'id\tvalue\n001\t同じ\n002\t a  b\n003\t2026/1/2\n004\t\n005\t削除\n006\t<img src=x>\n';
  const b = 'id\tvalue\n1\t同じ\n002\ta b\n003\t2026-1-3\n004\t追加\n005\t\n006\t&文字列\n';
  const [stats] = send({ type: 'compare', revision: 1, a, b });
  assert.equal(stats.changedCells, 6);
  assert.equal(stats.changedRowCount, 6);
  assert.equal(stats.added, 1);
  assert.equal(stats.removed, 1);
  assert.equal(stats.leadingZero, 1);
  const [view] = send({ type: 'viewport', revision: 1, token: 1, mode: 'different', rowStart: 0, rowEnd: 20, colStart: 0, colEnd: 2 });
  assert.deepEqual(view.rows.map(row => row.row), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(view.rows.map(row => row.categories), [
    ['leading-zero', 'same'], ['same', 'spacing'], ['same', 'date'],
    ['same', 'added'], ['same', 'removed'], ['same', 'changed'],
  ]);
  assert.equal(view.rows[5].a[1], '<img src=x>');
});

test('行列数が異なる表・CRLF・末尾空行・単一列の従来解釈', () => {
  const send = engine();
  const [stats] = send({ type: 'compare', revision: 2, a: 'A\r\nB\r\n\r\n', b: 'A\t\r\nB\t追加\r\nC\t値\r\n' });
  assert.equal(stats.aRows, 2);
  assert.equal(stats.aCols, 1);
  assert.equal(stats.rowCount, 3);
  assert.equal(stats.colCount, 2);
  assert.equal(stats.changedCells, 3);
  assert.equal(stats.added, 3);
  assert.equal(send({ type: 'compare', revision: 3, a: ' \n', b: 'a' })[0].type, 'error');
});

test('メタ情報の解析を比較で再利用し、変更した側だけ再解析できる', () => {
  const send = engine();
  send({ type: 'meta', side: 0, version: 1, text: 'a\tb', revision: 1 });
  send({ type: 'meta', side: 1, version: 1, text: 'a\tc', revision: 1 });
  assert.equal(send({ type: 'compare', revision: 2 })[0].changedCells, 1);
  assert.equal(send({ type: 'compare', revision: 3, b: 'a\tb' })[0].changedCells, 0);
  assert.equal(send({ type: 'compare', revision: 4 })[0].changedCells, 0);
  assert.deepEqual(send({ type: 'viewport', revision: 2, token: 1, mode: 'all', rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 2 }), []);
  send({ type: 'clear', revision: 5 });
  assert.deepEqual(send({ type: 'viewport', revision: 4, token: 2, mode: 'all', rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 2 }), []);
});

test('20万行でも関数引数上限に依存せず、末尾の表示範囲だけ返す', () => {
  const send = engine();
  const rows = 200000;
  const a = Array.from({ length: rows }, (_, row) => `${row}\t同じ`).join('\n');
  const b = a.slice(0, -2) + '変更';
  const [stats] = send({ type: 'compare', revision: 1, a, b });
  assert.equal(stats.rowCount, rows);
  assert.equal(stats.changedCells, 1);
  const [view] = send({ type: 'viewport', revision: 1, token: 2, mode: 'all', rowStart: rows - 2, rowEnd: rows + 20, colStart: 1, colEnd: 2 });
  assert.equal(view.rows.length, 2);
  assert.equal(view.rows.at(-1).row, rows - 1);
  assert.equal(view.rows.at(-1).b[0], '変更');
});
