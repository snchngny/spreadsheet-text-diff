// OS入力ではなくscrollTop/scrollLeftを合成操作し、仮想表示の追従を確認する
document.querySelector('#scroll-regression').onclick = async () => {
  const checks = [];
  const check = (name, condition) => { if (!condition) throw Error(name); checks.push(name); };
  const scrolls = [document.querySelector('#scrollA'), document.querySelector('#scrollB')];
  const tables = [document.querySelector('#sheetA'), document.querySelector('#sheetB')];
  const mutations = [0, 0];
  const observers = tables.map((table, index) => {
    const observer = new MutationObserver(records => { mutations[index] += records.filter(record => record.type === 'childList').length; });
    observer.observe(table, { childList: true });
    return observer;
  });
  const edgeCounts = { normal: 0, vertical: 0, horizontal: 0, reverseRight: 0 };
  const blankDetails = [];
  const blankEdges = (scroll, table) => {
    const viewport = scroll.getBoundingClientRect();
    const content = { left: viewport.left + scroll.clientLeft, top: viewport.top + scroll.clientTop,
      right: viewport.left + scroll.clientLeft + scroll.clientWidth,
      bottom: viewport.top + scroll.clientTop + scroll.clientHeight };
    const header = table.querySelector('thead .corner')?.getBoundingClientRect();
    const rowHeader = table.querySelector('tbody .row-num')?.getBoundingClientRect();
    const cells = Array.from(table.querySelectorAll('tbody td[data-cell]'), cell => cell.getBoundingClientRect())
      .filter(rect => rect.width && rect.height && rect.right > content.left && rect.left < content.right &&
        rect.bottom > content.top && rect.top < content.bottom);
    if (!header || !rowHeader || !cells.length) return ['top', 'bottom', 'left', 'right'];
    const area = { left: content.left + rowHeader.width, right: content.right,
      top: content.top + header.height, bottom: content.bottom };
    const edges = [];
    if (Math.min(...cells.map(rect => rect.top)) > area.top + 3) edges.push('top');
    if (Math.max(...cells.map(rect => rect.bottom)) < area.bottom - 3) edges.push('bottom');
    if (Math.min(...cells.map(rect => rect.left)) > area.left + 3) edges.push('left');
    if (Math.max(...cells.map(rect => rect.right)) < area.right - 3) edges.push('right');
    return edges;
  };
  const sampleBlanks = kind => {
    const missing = scrolls.flatMap((scroll, index) => blankEdges(scroll, tables[index]).map(edge => `${index ? 'B' : 'A'}:${edge}`));
    if (missing.length) {
      edgeCounts[kind] += 1;
      blankDetails.push({ kind, missing, top: scrolls[0].scrollTop, left: scrolls[0].scrollLeft,
        first: tables[0].querySelector('td[data-cell]')?.dataset.cell,
        last: tables[0].querySelector('td[data-cell]:last-child')?.dataset.cell });
    }
    return missing;
  };
  const runValues = async (kind, source, property, values) => {
    const blankSamples = [];
    source[property] = values[0];
    for (let i = 0; i < values.length; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      blankSamples.push(sampleBlanks(kind));
      if (i + 1 < values.length) source[property] = values[i + 1];
    }
    return blankSamples;
  };
  const lastCell = '#sheetA [data-cell="1999:19"]';
  try {
    document.querySelector('#clearButton').click(); await frame();
    const count = 2000, cols = 20;
    const aRows = Array.from({ length: count }, (_, row) => Array.from({ length: cols }, (_, col) => `R${row}C${col}`).join('\t'));
    const bRows = aRows.slice();
    for (let row = 0; row < count; row += 100) bRows[row] = bRows[row].replace('C19', 'C19_changed');
    input('A', aRows.join('\n')); input('B', bRows.join('\n'));
    await until(() => document.querySelector('#metaA').textContent.startsWith('2000行') && document.querySelector('#metaB').textContent.startsWith('2000行'));
    await compare();
    await until(() => document.querySelector('#sheetA [data-cell="0:0"]'));

    const top = scrolls[0], rightPane = scrolls[1];
    await runValues('normal', top, 'scrollTop', Array.from({ length: 40 }, (_, i) => (i + 1) * 31));
    check('通常31px/frame×40で可視領域の上下左右に空白なし', edgeCounts.normal === 0);

    top.scrollTop = 0; await frame();
    await runValues('vertical', top, 'scrollTop', Array.from({ length: 40 }, (_, i) => (i + 1) * 500));
    check('縦500px/frame×40で可視領域の上下左右に空白なし', edgeCounts.vertical === 0);

    const maxLeft = top.scrollWidth - top.clientWidth;
    const horizontalPath = Array.from({ length: 40 }, (_, i) => i % 2 === 0 ? maxLeft : 0);
    await runValues('horizontal', top, 'scrollLeft', horizontalPath);
    check('横端往復40フレームで可視領域の上下左右に空白なし', edgeCounts.horizontal === 0);

    const maxTop = top.scrollHeight - top.clientHeight;
    rightPane.scrollTop = maxTop;
    await until(() => document.querySelector('#sheetB [data-row="1999"]')); await frame();
    await runValues('reverseRight', rightPane, 'scrollTop', Array.from({ length: 40 }, (_, i) => Math.max(0, maxTop - (i + 1) * 500)));
    check('逆方向を右側ペイン起点で操作しても左右同期', top.scrollTop === rightPane.scrollTop && top.scrollLeft === rightPane.scrollLeft);
    check('逆方向・右側起点でも可視領域の上下左右に空白なし', edgeCounts.reverseRight === 0);

    top.scrollTop = top.scrollHeight; top.scrollLeft = top.scrollWidth;
    await until(() => document.querySelector(lastCell)); await frame();
    check('遠距離jump末尾のセル値', document.querySelector(lastCell).textContent === 'R1999C19');
    check('末尾jump後の左右スクロール同期', top.scrollTop === rightPane.scrollTop && top.scrollLeft === rightPane.scrollLeft);
    top.scrollTop = 0; top.scrollLeft = 0;
    await until(() => document.querySelector('#sheetA [data-cell="0:0"]'));
    check('遠距離jump先頭のセル値', document.querySelector('#sheetA [data-cell="0:0"]').textContent === 'R0C0');

    let racedClear = false;
    top.addEventListener('scroll', () => {
      document.querySelector('[data-mode="different"]').click();
      document.querySelector('#clearButton').click();
      racedClear = true;
    }, { once: true });
    rightPane.scrollTop = rightPane.scrollHeight;
    await until(() => racedClear); await frame(); await frame();
    check('filter切替とpending中のclearで旧結果が復活しない', document.querySelector('#result').hidden && !document.querySelector('#compareButton').disabled);
    check('pending中clear後に表を空にする', !document.querySelector('#sheetA [data-cell]') && !document.querySelector('#sheetB [data-cell]'));
    document.querySelector('[data-mode="all"]').click();
    input('A', 'key\tvalue\nnew\tlatest'); input('B', 'key\tvalue\nnew\tlatest');
    await compare();
    check('pending中clear後に再比較できる', document.querySelector('#sheetA [data-cell="1:1"]')?.textContent === 'latest');

    const wide = Array.from({ length: 300 }, (_, row) => Array.from({ length: 200 }, (_, col) => `W${row}C${col}`).join('\t')).join('\n');
    input('A', wide); input('B', wide); await compare();
    rightPane.scrollTop = rightPane.scrollHeight; rightPane.scrollLeft = rightPane.scrollWidth;
    await until(() => document.querySelector('#sheetB [data-cell="299:199"]')); await frame();
    check('200列の遠距離jumpで最新の末尾セルへ追従', document.querySelector('#sheetA [data-cell="299:199"]')?.textContent === 'W299C199');
    rightPane.scrollTop = 0; rightPane.scrollLeft = 0;
    await until(() => document.querySelector('#sheetB [data-cell="0:0"]')); await frame();
    check('200列の逆jump後も左右同期して先頭セル表示', document.querySelector('#sheetA [data-cell="0:0"]')?.textContent === 'W0C0' && top.scrollLeft === rightPane.scrollLeft && top.scrollTop === rightPane.scrollTop);

    await record({ version: location.pathname, scrollRegression: 'passed', checks, edgeCounts,
      syntheticScroll: true, tableRebuildMutations: mutations,
      renderedCells: tables.map(table => table.querySelectorAll('td[data-cell]').length),
      viewport: [innerWidth, innerHeight], userAgent: navigator.userAgent });
  } catch (error) {
    await record({ version: location.pathname, scrollRegression: 'failed', checks, edgeCounts, blankDetails, error: error.message,
      syntheticScroll: true, tableRebuildMutations: mutations });
  } finally { observers.forEach(observer => observer.disconnect()); }
};
