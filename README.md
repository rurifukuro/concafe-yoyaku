# concafe-yoyaku

コンカフェ1店舗向けの席予約Webアプリ（MVP）。

- お客さん画面：カレンダー + 空き状況 + 予約
- 管理者画面：予約台帳 + 受付解禁 + 席数設定

## 技術スタック

- **フロント**: React + Vite + TypeScript (strict)
- **データ**: Supabase (Postgres + Auth + RPC)
- **ホスティング**: GitHub Pages (静的配信, HashRouter)

## ローカル開発

```bash
npm install
cp .env.example .env   # VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を記入
npm run dev
```

## 環境変数 (.env)

| 変数名 | 説明 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase プロジェクトの URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase の anon/public key |
| `VITE_BASE_PATH` | GitHub Pages の base path (例: `/concafe-yoyaku/`)。ルートなら空でOK |

## Supabase セットアップ

1. [Supabase](https://supabase.com/) で新規プロジェクトを作成
2. SQL Editor で `supabase/migrations/001_initial.sql` を実行
3. Authentication > Users で管理者ユーザーを作成 (Email + Password)
4. Settings > API から URL と anon key を取得し `.env` に記入

## GitHub Pages デプロイ

```bash
# .env に VITE_BASE_PATH=/リポジトリ名/ を設定
npm run build
# dist/ フォルダの内容を gh-pages ブランチにデプロイ
```

手動の場合:
```bash
git subtree push --prefix dist origin gh-pages
```

または GitHub Actions で自動化（dist をデプロイするワークフローを設定）。

## 別アカウントへの移管手順

このアプリは特定アカウントへの依存がないため、以下の手順で別環境に移せます。

1. **リポジトリをフォーク or クローン**
2. **Supabase 新規プロジェクト作成** → SQL Editor で `supabase/migrations/001_initial.sql` を実行
3. **管理者ユーザー作成** → Supabase の Authentication > Users で Email + Password ユーザーを追加
4. **環境変数設定** → `.env` に新しい Supabase の URL / anon key を記入
5. **base path 変更** → `.env` の `VITE_BASE_PATH` を新しいリポジトリ名に合わせる (例: `/new-repo-name/`)
6. **ビルド & デプロイ** → `npm run build` して dist/ を GitHub Pages にデプロイ
7. **既存データの移行** (任意) → 旧 Supabase から CSV export → 新 Supabase に import

変更が必要な箇所は `.env` ファイルのみ。コード修正は不要です。
