# Spreadsheet Text Diff

表計算ソフトから貼り付けた2つの表を、ブラウザ内だけで比較する単体HTMLアプリです。

## 使い方

`index.html`をブラウザで開き、比較元と比較先の表を貼り付けます。サーバーや外部送信は使いません。

「比較する」、Ctrl＋Enter（Macは⌘＋Enter）、左右の入れ替え、差分行だけの表示、セルをクリックした詳細確認が使えます。従来どおり同じ行・列の位置で文字列を比較します。

## 大量の貼り付けデータへの対応

- 解析と比較はHTML内蔵のWeb Workerで実行し、変更した側の解析結果だけを更新・再利用します
- 左右の表はスクロール位置周辺の行・列だけ描画します。左右のスクロールは連動し、元の行番号を維持します
- 補完済みの左右全配列や全セルの分類配列を作らず、差分行と集計だけを保持します
- 入力を変更した場合は前の比較結果を隠します。「比較する」で最新の入力を比較してください

Web Worker・ResizeObserverに対応した現在のブラウザが必要です。Workerが使えない設定では画面内にエラーを表示します。依存ライブラリ、ビルド、データの保存はありません。

ブラウザ標準の貼り付け欄自体は入力全文を保持・描画するため、極端に長いテキストでは貼り付け直後の負荷が残ります。容量・行数の無制限対応は保証しません。

## 検証

Node.jsの標準機能だけで判定の回帰テストを実行できます。

```powershell
node --test tests/*.test.mjs
```

空白、先頭ゼロ、日付、行列数の違い、20万行の末尾取得に加え、100組の合成データで変更前の`2067c3b`と全セル・分類・集計が一致することを確認します。

ブラウザでの受入・性能試験は次を実行し、表示されたURLを開きます。このサーバーは試験専用で、通常利用には不要です。20分で終了し、Ctrl＋Cでも停止できます。

```powershell
node tests/browser.mjs 2067c3b
```

- `/current`：現在版。`Regression`で連続貼り付け、比較中の編集・クリア、ショートカット、入れ替え、フィルター、行列スクロール、セル詳細、ペイン拡大を確認
- `/baseline`：変更前。各`Run`ボタンで合成データを使った同条件の性能試験
- `/`：試験ボタンを付けない通常画面
- 測定結果：Git管理外の`.local/performance.jsonl`

他の試験を同時に実行せず、同じブラウザ・画面サイズで比較してください。データ生成時間は計測対象外です。入力欄への値の設定と`input`イベントで貼り付け後の処理を再現するため、OSのクリップボード処理時間や貼り付けの取り消し履歴は含みません。

## 自動deploy

Cloudflare Workers BuildsでこのGitHub repoを既存Worker `cool-wood-8a1d`へ接続し、`main` branchから自動deployします。Worker名は[wrangler.jsonc](wrangler.jsonc)の`name`と一致させます。同じWorkerへ接続することで、既存のURLを維持できます。GitHub Actionsはテストとpackage確認のみを実行します。

- CloudflareのBuild設定でproduction branchを`main`にし、preview buildsを無効にします
- Build command: `if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then git fetch --unshallow; fi && node --test tests/*.test.mjs && node scripts/build.mjs`
- Deploy command: `npx --yes wrangler@4.151.3 deploy`
- `scripts/build.mjs`は`index.html`だけを`dist/`へコピーします。未知のファイルが`dist/`にある場合は削除せず、buildを失敗させます
- Workers Builds側で認証するため、GitHub secretsやvariablesにCloudflare API tokenやaccount IDを追加する必要はありません。Cloudflare account emailもrepoへ記載しません

ローカル検証はNode.js 24で次を実行します。baseline commit参照のため、Git履歴がshallowな場合は全履歴を取得してからテストしてください。

```powershell
node --test tests/*.test.mjs
node scripts/build.mjs
```

### 性能確認結果（2026-10-21）

Windows・Headless Chrome 155、画面1881×2041、20列の合成文字列、100行ごとに1セル変更で測定。2つの表は同じサイズです。時間はこの環境での実測で、対応容量の保証値ではありません。

| データ（片側） | 変更前の比較→描画 | 変更後の比較→描画 | 左右の描画セル数 |
| --- | ---: | ---: | ---: |
| 2,000行×20列、約0.32MB | 4.00秒 | 0.08秒 | 80,000 → 952 |
| 10,000行×20列、約1.68MB | 17.02秒 | 0.09〜0.25秒 | 400,000 → 952 |
| 100,000行×20列、約18.78MB | 未測定 | 1.26〜1.33秒 | 952 |

差分件数はそれぞれ20・100・1,000セル／行で期待値と一致。1万行では入力開始から件数表示までが変更前3.97秒、変更後1.77〜1.93秒で、比較表示までを含めると約21秒から約2秒へ短縮。10万行では貼り付け欄の描画を含む件数表示に18.79〜19.78秒を要し、入力欄側の負荷は残ります。末尾セルの表示と、再比較後に先頭へ戻る動作も確認済みです。ブラウザ受入はHTTPで実施し、`file://`での実操作と他ブラウザは未測定です。

## repo境界

このdirectory自体を独立Git repoとして管理します。ほかのアプリや作業projectのファイルは含めません。
