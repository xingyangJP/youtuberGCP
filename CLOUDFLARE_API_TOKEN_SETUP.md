# Cloudflare API Token 権限設定ガイド

## 🎯 目的

現在の API Token に **Cloudflare Access** の管理権限を追加し、API経由で Service Token ポリシーを設定できるようにする。

---

## 📋 現在の状況

現在の API Token では以下のエラーが発生：
```json
{
  "success": false,
  "errors": [
    {
      "code": 10000,
      "message": "Authentication error"
    }
  ]
}
```

これは、**Access リソースへのアクセス権限が不足**していることを示しています。

---

## ✅ 解決方法1: 既存トークンに権限を追加（推奨）

### ステップ1: Cloudflare Dashboard にログイン

1. **https://dash.cloudflare.com/** にアクセス
2. あなたのアカウントでログイン

### ステップ2: API Tokens 設定ページに移動

1. 右上のアカウントアイコンをクリック
2. **My Profile** を選択
3. 左サイドバーから **API Tokens** をクリック

### ステップ3: 既存の API Token を編集

1. 現在使用している API Token を探す
   - Token 名や作成日で特定
   - または、すべてのトークンをリストアップして確認

2. 対象トークンの右側にある **Edit** ボタンをクリック

### ステップ4: 権限を追加

**Permissions** セクションで以下を追加：

#### 必要な権限（最小限）

| Permission Type | Resource | Permission Level |
|----------------|----------|------------------|
| **Account** | Access: Apps and Policies | **Edit** |
| **Account** | Access: Service Tokens | **Edit** |

#### 推奨される追加権限（フル管理）

| Permission Type | Resource | Permission Level |
|----------------|----------|------------------|
| **Account** | Access: Organizations, Identity Providers, and Groups | **Edit** |

#### 設定手順

1. **Add** をクリックして新しい権限を追加
2. **Permission Type** として `Account` を選択
3. **Permission** として以下を選択：
   - `Access: Apps and Policies` → **Edit**
   - `Access: Service Tokens` → **Edit**
4. 必要に応じて他の Access 関連権限も追加

### ステップ5: Account Resources を確認

**Account Resources** セクションで：
- **Include** → **All accounts** 
- または特定のアカウント: `f95e6d338f3edf13e433809bb25edb15`

### ステップ6: 保存して確認

1. **Continue to summary** をクリック
2. 権限内容を確認
3. **Save** をクリック

---

## ✅ 解決方法2: 新しい API Token を作成（推奨度: 高）

既存トークンの編集が難しい場合、新しいトークンを作成します。

### ステップ1: API Tokens ページで新規作成

1. **https://dash.cloudflare.com/profile/api-tokens** にアクセス
2. **Create Token** をクリック

### ステップ2: カスタムトークンを作成

1. **Create Custom Token** の **Get started** をクリック
2. Token name: `Cloudflare Pages + Access Admin` （任意の名前）

### ステップ3: 必要な権限を設定

**Permissions** セクション：

#### Cloudflare Pages 用の権限
| Permission Type | Resource | Permission Level |
|----------------|----------|------------------|
| **Account** | Cloudflare Pages | **Edit** |
| **Account** | D1 | **Edit** |
| **Account** | Workers KV Storage | **Edit** |
| **Account** | Workers R2 Storage | **Edit** |

#### Cloudflare Access 用の権限
| Permission Type | Resource | Permission Level |
|----------------|----------|------------------|
| **Account** | Access: Apps and Policies | **Edit** |
| **Account** | Access: Service Tokens | **Edit** |
| **Account** | Access: Organizations, Identity Providers, and Groups | **Edit** |

### ステップ4: Account Resources を設定

**Account Resources** セクション：
- **Include** → **All accounts**
- または特定のアカウント ID: `f95e6d338f3edf13e433809bb25edb15`

### ステップ5: IP Filtering (オプション)

セキュリティを強化する場合：
- **Client IP Address Filtering** → **Is in** → GitHub Actions の IP 範囲を追加
- または、すべての IP を許可（開発時は推奨）

### ステップ6: TTL (有効期限)

- **Start Date**: 今日
- **End Date**: なし（永続）または 1年後

### ステップ7: 作成して保存

1. **Continue to summary** をクリック
2. 内容を確認
3. **Create Token** をクリック
4. **生成されたトークンをコピー**（再表示不可！）

---

## 🔧 新しい API Token を Cloudflare Pages に設定

新しいトークンを作成した場合、以下の手順で設定：

### Sandbox 環境で設定

```bash
cd /home/user/webapp

# 新しい API Token を環境変数に設定
export CLOUDFLARE_API_TOKEN="your-new-token-here"

# .bashrc に追加（永続化）
echo 'export CLOUDFLARE_API_TOKEN="your-new-token-here"' >> ~/.bashrc

# 動作確認
npx wrangler whoami
```

### 期待される出力

```
Getting User settings...
👋 You are logged in with an API Token, associated with the email 'your-email@example.com'!
┌──────────────────────────────┬──────────────────────────────────┐
│ Account Name                 │ Account ID                       │
├──────────────────────────────┼──────────────────────────────────┤
│ Your Account                 │ f95e6d338f3edf13e433809bb25edb15 │
└──────────────────────────────┴──────────────────────────────────┘
```

---

## 🧪 Access 権限のテスト

新しいトークンで Access API にアクセスできるか確認：

```bash
cd /home/user/webapp

# Service Tokens を取得
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/f95e6d338f3edf13e433809bb25edb15/access/service_tokens" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" | jq '.'
```

### 期待される出力（成功）

```json
{
  "success": true,
  "result": [
    {
      "id": "...",
      "name": "CRONTOKEN",
      "client_id": "956d91e22bd7517b3a271251184986dc.access",
      "created_at": "...",
      "updated_at": "...",
      "duration": "..."
    }
  ]
}
```

### エラーが出る場合（失敗）

```json
{
  "success": false,
  "errors": [
    {
      "code": 10000,
      "message": "Authentication error"
    }
  ]
}
```

→ トークンの権限設定を再確認してください。

---

## 🔍 トラブルシューティング

### 問題1: "Authentication error" が続く

**原因**: 
- 権限が正しく設定されていない
- Account ID が間違っている

**解決策**:
1. API Token の権限を再確認
2. `Account Resources` で正しいアカウントが選択されているか確認
3. トークンを一度削除して、新規作成

### 問題2: トークンの編集画面が見つからない

**原因**: 
- あなたが作成したトークンではない
- 管理者権限がない

**解決策**:
- 新しいトークンを作成（解決方法2を使用）

### 問題3: 権限の選択肢に "Access" が表示されない

**原因**: 
- あなたのアカウントで Cloudflare Access が有効化されていない
- Zero Trust プランに加入していない

**解決策**:
1. Zero Trust プランを有効化:
   - https://dash.cloudflare.com/ → **Zero Trust** → **Start**
2. 無料プランでも Access の基本機能は使用可能

---

## 📊 必要な権限の完全リスト

API Token に設定すべき権限の完全リスト：

### フル機能（推奨）

```
Account Permissions:
├─ Cloudflare Pages: Edit
├─ D1: Edit
├─ Workers KV Storage: Edit
├─ Workers R2 Storage: Edit
├─ Access: Apps and Policies: Edit
├─ Access: Service Tokens: Edit
└─ Access: Organizations, Identity Providers, and Groups: Edit

Account Resources:
└─ Include: All accounts (or specific account ID)
```

### 最小限（Access のみ）

```
Account Permissions:
├─ Access: Apps and Policies: Edit
└─ Access: Service Tokens: Edit

Account Resources:
└─ Include: All accounts (or specific account ID)
```

---

## 🎯 次のステップ

API Token の権限設定が完了したら：

1. **権限をテスト**:
   ```bash
   cd /home/user/webapp
   ./check_access_full.sh
   ```

2. **Access ポリシーを API 経由で設定** (後続の作業で実施)

3. **GitHub Actions で使用**（secrets に追加）

---

## 📞 サポート

- Cloudflare API Tokens ドキュメント: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Cloudflare Access API ドキュメント: https://developers.cloudflare.com/api/operations/access-applications-list-access-applications

---

**重要**: 新しい API Token を生成した場合、必ず安全な場所に保管してください。再表示できません。
