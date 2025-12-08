# Cloudflare Access 設定ガイド（Service Token 認証）

## 🚨 現在の問題

`curl` で CF-Access ヘッダーを送信しても **HTTP 302** リダイレクトが発生し、`service_token_status: false` が返される。

**原因**: Cloudflare Access のポリシーに Service Token (CRONTOKEN) が追加されていない。

---

## ✅ 解決手順（Cloudflare Dashboard で実施）

### ステップ1: Cloudflare Dashboard にログイン

1. https://dash.cloudflare.com/ にアクセス
2. あなたのアカウントでログイン

### ステップ2: Zero Trust セクションに移動

1. 左サイドバーから **Zero Trust** をクリック
2. **Access** → **Applications** を選択

### ステップ3: 対象アプリケーションを探す

以下のいずれかの名前/ドメインを持つアプリケーションを探してください：
- ドメイン: `webapp-30w.pages.dev`
- チーム名: `xerographix`
- または、`pages.dev` を含むアプリケーション

**見つからない場合:**
- Zero Trust → Settings → Custom Pages で、あなたのチーム名（xerographix）を確認
- そのチームに関連付けられたアプリケーションを探す

### ステップ4: アプリケーションのポリシーを編集

1. 対象アプリケーションの **Edit** ボタンをクリック
2. **Policies** タブを開く
3. 以下のいずれかを実行：

#### オプションA: 既存ポリシーに Service Token を追加

既存のポリシーがある場合：
1. ポリシーの **Edit** をクリック
2. **Configure rules** セクションで以下を設定：
   - **Include** ルール:
     - Selector: `Service Auth`
     - Value: **CRONTOKEN** を選択
   - または新しい **Include** ルールを追加:
     - "Add include" → `Service Auth` → `CRONTOKEN`
3. **Save** をクリック

#### オプションB: 新しい Bypass ポリシーを作成（推奨）

新しいポリシーを作成する場合：
1. **Add a policy** をクリック
2. 以下を設定：
   - **Policy name**: `Cron API Access`
   - **Action**: `Bypass` または `Service Auth`
   - **Session duration**: `No duration, expires immediately`
   
3. **Configure rules** セクション:
   - **Include** ルールを追加:
     - Selector: `Service Auth`
     - Value: **CRONTOKEN** を選択
   
4. **Additional settings**（オプション、セキュリティ強化）:
   - **Path is**: `/api/cron/*` または `/api/debug/*`
   - これにより、Cron エンドポイントのみに適用

5. **Save policy** をクリック

### ステップ5: ポリシーの優先順位を確認

複数のポリシーがある場合：
1. **Policies** タブで順序を確認
2. より具体的なポリシー（Service Auth）を上位に配置
3. 一般的なポリシー（Email ドメインなど）を下位に配置

### ステップ6: 変更を保存して待機

1. すべての変更を **Save** で保存
2. **1-2分** 待つ（ポリシー変更の反映時間）

---

## 🧪 テスト手順

### テスト1: Service Token での認証

```bash
curl -i \
  -H "CF-Access-Client-Id: 956d91e22bd7517b3a271251184986dc.access" \
  -H "CF-Access-Client-Secret: 72ced5b9677e6870a3057f7b32bbc53d631e22fdb79f2867a622bdf9cf8e7b8c" \
  https://webapp-30w.pages.dev/api/debug/schedule-runs
```

**期待される結果:**
- ステータスコード: `HTTP/2 200`
- JSON レスポンス（スケジュール実行履歴）

**失敗の場合（HTTP 302）:**
- ポリシー設定が正しくない
- Service Token が認識されていない

### テスト2: ヘッダーなしでのアクセス（確認用）

```bash
curl -i https://webapp-30w.pages.dev/api/debug/schedule-runs
```

**期待される結果:**
- ステータスコード: `HTTP/2 302`
- リダイレクト先: Cloudflare Access ログインページ

これは正常な動作（認証なしでアクセス拒否）

---

## 🔍 トラブルシューティング

### 問題1: Service Token (CRONTOKEN) が選択肢に表示されない

**解決策:**
1. Zero Trust → Access → **Service Authentication** に移動
2. **CRONTOKEN** が存在するか確認
3. 存在しない場合:
   - **Create Service Token** をクリック
   - Name: `CRONTOKEN`
   - Duration: `Non-expiring` または `1 year`
   - 生成された Client ID/Secret をコピー（再表示不可）
   - 新しい ID/Secret を使用する場合、Cloudflare Pages の secrets を更新:
     ```bash
     echo 'NEW_CLIENT_ID' | npx wrangler pages secret put CF_ACCESS_CLIENT_ID --project-name webapp
     echo 'NEW_CLIENT_SECRET' | npx wrangler pages secret put CF_ACCESS_CLIENT_SECRET --project-name webapp
     ```

### 問題2: アプリケーションが見つからない

**解決策:**
1. Zero Trust → Settings → **General** で Team domain を確認
2. Zero Trust → Access → **Applications** で "pages.dev" で検索
3. 見つからない場合、新しいアプリケーションを作成:
   - **Add an application** → **Self-hosted**
   - Application name: `webapp-30w.pages.dev`
   - Session duration: `24 hours`
   - Application domain: 
     - Subdomain: `webapp-30w`
     - Domain: `pages.dev`
   - Identity providers: あなたが使用している IdP を選択
   - **Add a policy**（上記のステップ4を参照）

### 問題3: ポリシー変更後も HTTP 302 が続く

**解決策:**
1. ブラウザのキャッシュをクリア
2. `curl` で `-H "Cache-Control: no-cache"` を追加
3. 5分待ってから再テスト（CDN キャッシュのクリア）
4. Cloudflare Dashboard で最近のアクセスログを確認:
   - Zero Trust → Logs → **Access**
   - 失敗したリクエストの詳細を確認

---

## 📋 設定完了後のチェックリスト

- [ ] Zero Trust → Access → Applications で対象アプリケーションが存在する
- [ ] ポリシーに Service Auth (CRONTOKEN) が含まれている
- [ ] Service Token (CRONTOKEN) が Service Authentication に存在する
- [ ] Client ID/Secret が Cloudflare Pages の secrets に設定されている
- [ ] `curl` テストで HTTP 200 が返る
- [ ] GitHub Actions secrets に `CF_ACCESS_CLIENT_ID` と `CF_ACCESS_CLIENT_SECRET` が設定されている

---

## 🎯 最終目標

GitHub Actions ワークフローから以下のエンドポイントに **認証なしでアクセス可能** にする：
- `https://webapp-30w.pages.dev/api/cron/run-schedule`
- `https://webapp-30w.pages.dev/api/cron/process-jobs`
- `https://webapp-30w.pages.dev/api/cron/check-jobs`

Service Token 認証により、Cron ジョブが安全に実行される。

---

## 📞 サポート

設定で問題が発生した場合：
1. Cloudflare Dashboard のスクリーンショットを共有
2. `curl` のレスポンス全体（ヘッダー含む）を共有
3. Zero Trust → Logs → Access でエラーログを確認

---

**現在の Service Token 情報:**
- Client ID: `956d91e22bd7517b3a271251184986dc.access`
- Client Secret: `72ced5b9677e6870a3057f7b32bbc53d631e22fdb79f2867a622bdf9cf8e7b8c`

**注意**: これらの認証情報は機密情報です。GitHub repository secrets に保存し、コードには含めないでください。
