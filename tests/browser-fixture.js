// 合成データ専用。入力代入＋inputイベントで、貼り付け後と同じ処理経路を通す
const output = document.querySelector('#bench-output');
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
async function until(predicate, timeout = 30000) {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) throw Error('条件待ちが時間切れ');
    await new Promise(resolve => setTimeout(resolve, 16));
  }
}
function input(side, text) {
  const element = document.querySelector('#input' + side);
  element.value = text;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
const stats = () => Array.from(document.querySelectorAll('#summary b'), el => +el.textContent.replaceAll(',', ''));
const ready = () => !document.querySelector('#result').hidden && !document.querySelector('#compareButton').disabled && document.querySelector('#sheetA td[data-cell]');
async function compare() { document.querySelector('#compareButton').click(); await until(ready); await frame(); }
async function record(result) { output.textContent = JSON.stringify(result); await fetch('/result', { method: 'POST', body: JSON.stringify(result) }); }

for (const button of document.querySelectorAll('[data-rows]')) button.onclick = async () => {
  let heartbeat;
  const tasks = [];
  const observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(e => e.duration)));
  try {
    button.disabled = true;
    document.querySelector('#clearButton').click(); await frame();
    const count = +button.dataset.rows, cols = 20;
    const rows = Array.from({ length: count }, (_, row) => Array.from({ length: cols }, (_, col) => `R${row}C${col}`).join('\t'));
    const a = rows.join('\n');
    for (let row = 0; row < count; row += 100) rows[row] = rows[row].replace('C0', 'C0_changed');
    const b = rows.join('\n');
    let maxLag = 0, beats = 0, last = performance.now();
    observer.observe({ type: 'longtask', buffered: false });
    heartbeat = setInterval(() => { const now = performance.now(); maxLag = Math.max(maxLag, now - last - 16); last = now; beats++; }, 16);
    const start = performance.now();
    input('A', a); input('B', b);
    const inputReturned = performance.now() - start;
    await until(() => /^\d/.test(document.querySelector('#metaA').textContent) && /^\d/.test(document.querySelector('#metaB').textContent));
    await frame();
    const metaReady = performance.now() - start;
    const compareStart = performance.now();
    await compare();
    const comparePaint = performance.now() - compareStart;
    const firstStats = stats();
    const cells = document.querySelectorAll('td[data-cell]').length;
    const scroll = document.querySelector('#scrollA');
    scroll.scrollTop = scroll.scrollHeight;
    scroll.scrollLeft = scroll.scrollWidth;
    await until(() => document.querySelector(`#sheetA [data-cell="${count - 1}:${cols - 1}"]`));
    const lastValue = document.querySelector(`#sheetA [data-cell="${count - 1}:${cols - 1}"]`).textContent;
    if (lastValue !== `R${count - 1}C${cols - 1}`) throw Error('末尾セルの表示が不一致');
    const repeatStart = performance.now();
    await compare();
    const repeatComparePaint = performance.now() - repeatStart;
    if (scroll.scrollTop !== 0 || scroll.scrollLeft !== 0 || !document.querySelector('#sheetA [data-cell="0:0"]')) throw Error('再比較後に先頭セルへ戻らない');
    await frame();
    clearInterval(heartbeat); observer.disconnect();
    const expected = Math.ceil(count / 100);
    if (firstStats.join() !== [expected, expected, 0, 0].join()) throw Error('差分集計が期待値と不一致');
    await record({ version: location.pathname, rows: count, cols, bytesPerSide: new Blob([a]).size,
      inputReturned: Math.round(inputReturned), metaReady: Math.round(metaReady), comparePaint: Math.round(comparePaint),
      repeatComparePaint: Math.round(repeatComparePaint), maxLag: Math.round(maxLag), beats,
      maxLongTask: Math.round(Math.max(0, ...tasks)), cells, lastCellVerified: true, stats: firstStats,
      viewport: [innerWidth, innerHeight], userAgent: navigator.userAgent });
  } catch (error) { await record({ version: location.pathname, error: error.message }); }
  finally { clearInterval(heartbeat); observer.disconnect(); button.disabled = false; }
};

document.querySelector('#regression').onclick = async () => {
  const checks = [];
  const check = (name, condition) => { if (!condition) throw Error(name); checks.push(name); };
  const clear = () => document.querySelector('#clearButton').click();
  try {
    clear();
    document.querySelector('#swapButton').click(); await frame();
    check('未比較時の入れ替えで比較を開始しない', document.querySelector('#error').hidden && document.querySelector('#result').hidden);
    input('A', 'id\tvalue\n001\t同じ\n002\t a  b\n003\t2026/1/2\n004\t\n005\t削除\n006\t<img src=x>');
    input('B', 'id\tvalue\n1\t同じ\n002\ta b\n003\t2026-1-3\n004\t追加\n005\t\n006\t&文字列');
    await until(() => document.querySelector('#metaA').textContent.startsWith('7行') && document.querySelector('#metaB').textContent.startsWith('7行'));
    check('左右を連続貼り付けして両方の件数更新', true);
    await compare();
    check('集計一致', stats().join() === '6,6,2,1');
    check('HTMLを文字列として表示', !document.querySelector('#sheetCompare img') && document.querySelector('#sheetA [data-cell="6:1"]').textContent === '<img src=x>');
    document.querySelector('#sheetA [data-cell="1:0"]').click();
    await until(() => document.querySelector('#inspector').textContent.includes('先頭ゼロ'));
    check('セル詳細と左右の選択', document.querySelectorAll('td.selected').length === 2);
    document.querySelector('[data-mode="different"]').click();
    await until(() => !document.querySelector('#sheetA [data-cell="0:0"]'));
    check('差分行フィルター', document.querySelectorAll('#sheetA td[data-cell]').length === 12);
    document.querySelector('#swapButton').click(); await until(ready); await frame();
    check('入れ替え後の集計一致', stats().join() === '6,6,2,1');
    document.querySelector('[data-mode="all"]').click(); await frame();
    clear(); input('A', 'old\t1'); input('B', 'new\t2');
    document.querySelector('#compareButton').click(); clear(); await frame();
    check('比較中のクリアで旧結果が復活しない', document.querySelector('#result').hidden && !document.querySelector('#compareButton').disabled);
    input('A', 'abc\t001'); input('B', 'abc\t001');
    document.querySelector('#inputB').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await until(ready); await frame();
    check('貼付直後のCtrl+Enterで一致比較', stats()[0] === 0 && !document.querySelector('#sameMessage').hidden);
    input('A', 'old'); input('B', 'new'); document.querySelector('#compareButton').click();
    input('A', 'latest'); input('B', 'latest'); await frame();
    check('比較中の編集で旧結果を破棄', document.querySelector('#result').hidden);
    await compare(); check('編集後の再比較', stats()[0] === 0);
    input('B', 'different'); await compare();
    check('片側編集後の再比較', stats()[0] === 1 && document.querySelector('#metaB').textContent === '1行 × 1列');
    clear(); document.querySelector('#compareButton').click();
    await until(() => !document.querySelector('#error').hidden);
    check('空入力エラーから復帰', !document.querySelector('#compareButton').disabled);
    input('A', 'x'); input('B', 'x'); await compare();
    check('エラー後の比較', stats()[0] === 0);

    const rows = 300, cols = 200;
    const a = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => `R${row}C${col}`).join('\t')).join('\n');
    const bRows = a.split('\n'); bRows[24] += '_changed'; bRows[299] += '_changed';
    input('A', a); input('B', bRows.join('\n')); await compare();
    check('行列仮想化でDOM件数を抑制', document.querySelectorAll('td[data-cell]').length < 5000);
    const left = document.querySelector('#scrollA'), right = document.querySelector('#scrollB');
    left.scrollTop = left.scrollHeight; left.scrollLeft = left.scrollWidth;
    await until(() => document.querySelector('#sheetA [data-cell="299:199"]')); await frame();
    check('最終行最終列の値', document.querySelector('#sheetA [data-cell="299:199"]').textContent === 'R299C199');
    check('左右のスクロール同期', left.scrollTop === right.scrollTop && left.scrollLeft === right.scrollLeft);
    document.querySelector('#sheetB [data-cell="299:199"]').click();
    await until(() => document.querySelector('#inspector').textContent.includes('R299C199_changed'));
    check('仮想表示の末尾セル詳細', true);
    document.querySelector('[data-mode="different"]').click();
    await until(() => ['#sheetA', '#sheetB'].every(side => document.querySelectorAll(side + ' td[data-cell]').length > 0 && Array.from(document.querySelectorAll(side + ' .row-num'), cell => cell.textContent).join() === '25,300'));
    check('差分行フィルターで左右の元行番号を維持', ['#sheetA', '#sheetB'].every(side => Array.from(document.querySelectorAll(side + ' .row-num'), cell => cell.textContent).join() === '25,300'));
    document.querySelector('[data-mode="all"]').click(); await frame();
    left.scrollTop = 0; left.scrollLeft = 0;
    await until(() => document.querySelector('#sheetA [data-cell="0:0"]'));
    const stripeColors = () => ['#sheetA', '#sheetB'].map(side => getComputedStyle(document.querySelector(side + ' [data-cell="24:0"]')).backgroundColor);
    const initialRowColors = stripeColors();
    const initialFirstRow = +document.querySelector('#sheetA [data-cell]').dataset.row;
    left.scrollTop = 7 * 31;
    await until(() => +document.querySelector('#sheetA [data-cell]').dataset.row === initialFirstRow + 1 && ['#sheetA', '#sheetB'].every(side => document.querySelector(side + ' [data-cell="24:0"]')));
    await frame();
    check('仮想表示範囲が1行移動しても左右の同じ元行で縞色を維持', JSON.stringify(stripeColors()) === JSON.stringify(initialRowColors));
    document.querySelector('[data-mode="different"]').click();
    await until(() => ['#sheetA', '#sheetB'].every(side => document.querySelectorAll(side + ' td[data-cell]').length > 0 && Array.from(document.querySelectorAll(side + ' .row-num'), cell => cell.textContent).join() === '25,300' && document.querySelector(side + ' [data-cell="24:0"]'))); await frame();
    check('差分行フィルターでも左右の同じ元行で縞色を維持', JSON.stringify(stripeColors()) === JSON.stringify(initialRowColors));
    document.querySelector('[data-mode="all"]').click(); await frame();
    left.scrollTop = 0;
    await until(() => +document.querySelector('#sheetA [data-cell]').dataset.row === 0);
    const originalHeight = left.style.height;
    left.style.height = '800px'; right.style.height = '800px';
    await until(() => document.querySelector('#sheetA [data-row="25"]'));
    check('ペイン拡大時に表示範囲更新', true);
    left.style.height = right.style.height = originalHeight;
    await record({ version: location.pathname, regression: 'passed', checks });
  } catch (error) { await record({ version: location.pathname, regression: 'failed', checks, error: error.message }); }
};
