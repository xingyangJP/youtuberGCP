# Cloudflare Access 設定（最短手順）

## 🎯 目的

`webapp-30w.pages.dev` へのCronアクセスを、Service Token (CRONTOKEN) で認証できるようにする。

---

## ✅ 最短手順（5分で完了）

### ステップ1: Zero Trust Dashboard にアクセス

1. **https://one.dash.cloudflare.com/** にアクセス
2. または、**https://dash.cloudflare.com/** → 左サイドバー → **Zero Trust**

### ステップ2: Service Token (CRONTOKEN) を確認

1. **Access** → **Service Authentication** をクリック
2. **CRONTOKEN** が存在するか確認
   - Client ID: `956d91e22bd7517b3a271251184986dc.access`

**もし存在しない場合:**
- 問題があります。CRONTOKENが既に削除されているか、別のアカウントに存在します
- 新しいService Tokenを作成する必要があります

### ステップ3: Access Application を確認

1. **Access** → **Applications** をクリック
2. **`webapp-30w.pages.dev`** または **`*.pages.dev`** を探す

**アプリケーションが存在する場合:**
- → ステップ4へ

**アプリケーションが存在しない場合:**
- → ステップ5へ（新規作成）

### ステップ4: 既存アプリケーションにポリシーを追加

1. `webapp-30w.pages.dev` アプリケーションの **Edit** をクリック
2. **Policies** タブを開く
3. **Add a policy** をクリック
4. 以下を設定：
   - **Policy name**: `Cron API Access`
   - **Action**: `Bypass`
   - **Configure rules**:
     - **Include** → `Service Auth` → **CRONTOKEN** を選択
5. **Save policy** をクリック
6. → **テストへ**（ステップ6）

### ステップ5: 新規アプリケーションを作成

アプリケーションが存在しない場合：

1. **Add an application** をクリック
2. **Self-hosted** を選択
3. 以下を入力：
   - **Application name**: `webapp Pages`
   - **Session Duration**: `24 hours`
   - **Application domain**:
     - Subdomain: `webapp-30w`
     - Domain: `pages.dev`
4. **Next** をクリック
5. **Add a policy**:
   - **Policy name**: `Cron API Access`
   - **Action**: `Bypass`
   - **Configure rules**:
     - **Include** → `Service Auth` → **CRONTOKEN** を選択
6. **Next** → **Add application** をクリック

### ステップ6: テスト（2分待機後）

ポリシー設定後、**2分待ってから**以下を実行：

```bash
curl -i \
  -H "CF-Access-Client-Id: 956d91e22bd7517b3a271251184986dc.access" \
  -H "CF-Access-Client-Secret: 72ced5b9677e6870a3057f7b32bbc53d631e22fdb79f2867a622bdf9cf8e7b8c" \
  https://webapp-30w.pages.dev/api/debug/schedule-runs
```

**期待される結果:**
- ✅ **HTTP/2 200**
- ✅ JSON レスポンス

**失敗する場合（HTTP 302）:**
- さらに5分待つ（CDNキャッシュのクリア）
- Zero Trust → Logs → Access でエラーを確認

---

## 🚨 トラブルシューティング

### 問題1: CRONTOKEN が Service Authentication に存在しない

**解決策: 新しいService Tokenを作成**

1. **Access** → **Service Authentication** → **Create Service Token**
2. 以下を入力：
   - **Name**: `CRONTOKEN`
   - **Duration**: `Non-expiring`
3. **Generate** をクリック
4. **Client ID** と **Client Secret** をコピー（再表示不可！）
5. 新しい認証情報をCloudflare Pagesに設定：

```bash
# 新しいClient IDとSecretを使用
echo 'NEW_CLIENT_ID' | npx wrangler pages secret put CF_ACCESS_CLIENT_ID --project-name webapp
echo 'NEW_CLIENT_SECRET' | npx wrangler pages secret put CF_ACCESS_CLIENT_SECRET --project-name webapp
```

6. GitHub Actions secretsも更新

### 問題2: アプリケーションが見つからず、作成もできない

**原因**: Zero Trustが完全に有効化されていない

**解決策**:
1. **Zero Trust** → **Settings** → **General**
2. **Team domain** が設定されているか確認
3. 未設定の場合、Team nameを入力して保存

### 問題3: Service Auth の選択肢が表示されない

**原因**: ポリシー作成時にService Tokenが認識されていない

**解決策**:
1. 一度ブラウザをリフレッシュ
2. Access → Service Authentication でCRONTOKENが存在することを再確認
3. 再度ポリシー作成を試す

---

## 📊 設定完了の確認

以下をすべて確認してください：

- [ ] Zero Trust → Access → Service Authentication に **CRONTOKEN** が存在
- [ ] Zero Trust → Access → Applications に **webapp-30w.pages.dev** が存在
- [ ] アプリケーションのPoliciesタブに **Cron API Access** ポリシーが存在
- [ ] ポリシーのIncludeルールに **Service Auth: CRONTOKEN** が設定されている
- [ ] `curl` テストで **HTTP 200** が返る

---

## 🎯 最終確認コマンド

すべての設定が完了したら、以下のコマンドを実行：

```bash
# テスト1: Service Token認証
curl -i \
  -H "CF-Access-Client-Id: 956d91e22bd7517b3a271251184986dc.access" \
  -H "CF-Access-Client-Secret: 72ced5b9677e6870a3057f7b32bbc53d631e22fdb79f2867a622bdf9cf8e7b8c" \
  https://webapp-30w.pages.dev/api/debug/schedule-runs

# テスト2: 認証なし（302リダイレクトが期待される）
curl -i https://webapp-30w.pages.dev/api/debug/schedule-runs
```

---

## 📞 次のステップ

設定が完了したら、以下を報告してください：

1. ✅ CRONTOKENがService Authenticationに存在する
2. ✅ アプリケーションとポリシーを作成した
3. ✅ `curl` テストで HTTP 200 が返る

または、エラーが発生した場合：
- スクリーンショットを共有
- エラーメッセージを共有
- Zero Trust → Logs → Access でログを確認

---

**重要**: この手順は **API Token の権限設定とは独立** しています。Dashboard経由で設定すれば、API Token の権限は不要です。
