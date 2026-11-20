# DataRangeFinder

宇宙誕生から西暦3000年までを探索する年表アプリです。端末・移動・年表の3つのモードがあります。
Vite で静的ファイルへビルドし、Cloudflare Pages に配置します。

## ローカル開発

Node.js 22（22.12.0 以上）と npm を使用します。Pages のビルドでも .node-version で Node.js 22 を指定しています。

    npm ci
    npm run dev

## 確認とビルド

    npm test
    npm run build

ビルド結果は dist に出力されます。

## Cloudflare Pages: GitHub 連携

Cloudflare の Workers & Pages で Pages プロジェクトを作成し、GitHub の datarangefinder/rangefinder を接続します。
ビルド設定は以下のとおりです。

| 項目 | 値 |
| --- | --- |
| プロジェクト名 | rangefinder |
| Framework preset | None |
| Build command | npm run build |
| Build output directory | dist |
| Root directory | リポジトリ直下（未指定） |
| Node.js | 22（.node-version で指定） |
| ビルド環境変数 | 不要 |

公開するブランチを Production branch に指定します。本番を main にする場合は、設定を main に反映してください。develop はプレビュー用ブランチとして利用できます。
サーバーや Pages Functions、データベースの追加設定は不要です。

## Pages 環境でローカル確認

    npm run pages:dev

先にビルドしてから Wrangler で dist を配信します。既定の確認先は http://127.0.0.1:8788 です。

## 既存 Pages プロジェクトへ CLI でデプロイ

GitHub 連携で作成したプロジェクトへ、手動でデプロイすることもできます。

    npx wrangler login
    npm run pages:deploy

pages:deploy はビルド後、wrangler.jsonc のプロジェクト名と出力先を使用します。
通常は現在の Git ブランチを使い、Production branch と同じブランチなら本番、異なるブランチならプレビューへデプロイします。
明示的にプレビューのブランチを指定する場合:

    npm run pages:deploy -- --branch develop

Pages プロジェクト名が異なる場合は、wrangler.jsonc の name を合わせてください。

## 配信設定

- wrangler.jsonc: Pages プロジェクト名と dist 出力先。
- public/_headers: ハッシュ付き JS/CSS を長期キャッシュし、HTML は更新を確認します。
- .gitignore: 依存関係、ビルド結果、Wrangler のローカル状態を除外します。

公式資料: [ビルド設定](https://developers.cloudflare.com/pages/configuration/build-configuration/)、[Wrangler 設定](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)。
