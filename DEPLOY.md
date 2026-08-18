# デプロイ手順書 (本番環境向け)

## 1. Supabase のセットアップ
1. [Supabase](https://supabase.com/) で新しいプロジェクトを作成します。
2. `supabase/schema.sql` の内容を SQL Editor で実行し、テーブル、ビュー (`slot_availability`)、関数、RLS を作成します。
3. `Settings > API` から以下の情報をメモします:
   - **Project URL**
   - **anon public key**
   - **service_role secret** (管理者用)

## 2. LINE / LIFF のセットアップ
1. [LINE Developers](https://developers.line.biz/) でプロバイダーとチャネルを作成します。
2. LIFF アプリを追加し、`LIFF ID` を取得します。
3. 公開後の URL を `Endpoint URL` に設定してください。

## 3. 利用者画面 (LIFF) のデプロイ
LIFFは静的配信のみで動作します（Cloudflare Pages 等）。
1. `liff/config/config.js` を開き、メモした `LIFF_ID` と `SUPABASE_URL`, `SUPABASE_KEY` を入力します。
2. `liff/` フォルダをそのままアップロードしてください。
   - ※ビルドステップは不要です。

## 4. 管理システム (Admin) のデプロイ
管理画面は動的なサーバー（Render, Vercel 等）にデプロイします。
以下の環境変数を必ず設定してください:

| 変数名 | 説明 |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (重要) |
| `ADMIN_PASSWORD` | 全権限管理者用パスワード |
| `STAFF_PASSWORD` | 受付スタッフ用パスワード (機能制限あり) |
| `NEXT_PUBLIC_BASE_URL` | 管理画面の公開URL (例: `https://admin.example.com`) |
| `EXPERIENCE_API_URL` | 体験用システムのAPIホストURL (例: `https://exp.example.com`) |
| `EXPERIENCE_API_PASSWORD` | 体験用システムAPIの認証パスワード |

### 体験用システム (Host) の設定について
- **`EXPERIENCE_API_URL`**: 
  体験用システム（ルーム作成・ゲストURL発行）が稼働しているサーバーのURLを設定します。
  末尾に `/` は含めないでください（例: `https://my-experience-api.render.com`）。
- **`EXPERIENCE_API_PASSWORD`**:
  体験用システム側で設定されている `X-Admin-Password` と一致する文字列を設定します。

### ビルド設定
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start`
- **Node Version**: 18.x or 20.x 推奨
