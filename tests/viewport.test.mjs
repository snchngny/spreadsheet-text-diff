import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const workerSource = html.match(/const workerSource = String\.raw`([\s\S]*?)`;/)[1];
const viewportSource = html.slice(html.indexOf('    function currentViewport()'), html.indexOf('    function renderSide('));
const responseSource = html.slice(html.indexOf('    function handleViewport('), html.indexOf('    function renderResults('));

function setup() {
  let response;
  const engine = vm.createContext({ postMessage: data => { response = data; } });
  vm.runInContext(workerSource, engine);
  const text = Array.from({ length: 2000 }, (_, row) => Array.from({ length: 20 }, (_, col) => `R${row}C${col}`).join('\t')).join('\n');
  engine.onmessage({ data: { type: 'compare', revision: 1, a: text, b: text + '_changed' } });
  const sent = [], rendered = [];
  const scroll = { scrollTop: 0, scrollLeft: 0, clientHeight: 500, clientWidth: 584 };
  const button = { removeAttribute() {} };
  const context = vm.createContext({
    comparison: response, worker: { postMessage: data => sent.push(data) },
    revision: 1, renderToken: 0, renderFrame: 0, displayMode: 'all',
    cachedViewport: null, renderedViewport: null, pendingViewport: null,
    previousViewport: { row: 0, col: 0 },
    ROW_HEIGHT: 31, COL_WIDTH: 142, ROW_HEADER_WIDTH: 45, OVERSCAN: 5,
    scrolls: [scroll], tables: [0, 1], $: () => button,
    requestAnimationFrame: () => 1,
    renderSide: (side, _sideIndex, data) => { if (side === 0) rendered.push(data); },
  });
  vm.runInContext(viewportSource + responseSource, context);
  const deliver = request => { engine.onmessage({ data: request }); context.handleViewport(response); };
  return { context, scroll, sent, rendered, deliver };
}

test('先読み範囲内の高速移動はWorker応答を待たず最新セルを描画する', () => {
  const { context, scroll, sent, rendered, deliver } = setup();
  context.viewportRequest(); deliver(sent[0]);
  assert.equal(sent.length, 1);
  assert.ok(context.cachedViewport.data.rows.length < 500);
  assert.ok(rendered.at(-1).rows.length < 40);
  scroll.scrollTop = 500;
  context.viewportRequest();
  assert.equal(sent.length, 1, 'キャッシュ内の移動にWorker通信は不要');
  const view = rendered.at(-1);
  assert.ok(view.rows.some(row => row.a.includes('R20C0')));
  assert.ok(view.rowStart > 0);
  const count = rendered.length;
  scroll.scrollTop += 1; context.viewportRequest();
  assert.equal(rendered.length, count, '描画範囲内の小移動ではDOMを維持');
});

test('応答待ち中の移動をまとめ、遠距離ジャンプ後の最新位置へ追従する', () => {
  const { context, scroll, sent, rendered, deliver } = setup();
  context.viewportRequest(); deliver(sent[0]);
  scroll.scrollTop = 20000; context.viewportRequest();
  const pending = sent[1];
  scroll.scrollTop = 50000; context.viewportRequest();
  scroll.scrollTop = 60000; context.viewportRequest();
  assert.equal(sent.length, 2, '同時要求は1件');
  const count = rendered.length;
  deliver(pending);
  assert.equal(rendered.length, count, '古い位置の応答で画面を戻さない');
  assert.equal(sent.length, 3, '応答後すぐ最新位置を要求');
  deliver(sent[2]);
  assert.ok(rendered.at(-1).rows.some(row => row.a.includes('R1940C0')));
});

test('モード変更中の旧応答は採用せず、差分行の元行番号を維持する', () => {
  const { context, sent, rendered, deliver } = setup();
  context.viewportRequest();
  context.displayMode = 'different';
  deliver(sent[0]);
  assert.equal(rendered.length, 0);
  assert.equal(sent[1].mode, 'different');
  deliver(sent[1]);
  assert.equal(rendered.at(-1).rows.length, 1);
  assert.equal(rendered.at(-1).rows[0].row, 1999);
});

test('左右を続けて操作しても、反映待ちイベントが新しいスクロールを抑止しない', () => {
  const source = html.slice(html.indexOf('    function syncScroll('), html.indexOf('    function setupDrop('));
  const context = vm.createContext({ mirroredScroll: new WeakMap(), viewportRequest() {} });
  vm.runInContext(source, context);
  const pane = () => ({ scrollTop: 0, scrollLeft: 0, addEventListener(_name, handler) { this.scroll = handler; } });
  const left = pane(), right = pane();
  context.syncScroll(left, right); context.syncScroll(right, left);
  left.scrollTop = 100; left.scroll();
  assert.equal(right.scrollTop, 100);
  right.scrollTop = 200; right.scrollLeft = 300; right.scroll();
  assert.equal(left.scrollTop, 200);
  assert.equal(left.scrollLeft, 300);
  left.scroll(); // 遅れて届いた反映イベント
  assert.equal(right.scrollTop, 200);
  assert.equal(right.scrollLeft, 300);
});
