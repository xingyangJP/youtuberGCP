// D1(SQLite) -> Firestore 簡易移行スクリプト（tenant_id=1 前提）
// 前提:
// - `npm install` 済みで `@google-cloud/firestore` と `better-sqlite3` が使えること
// - GOOGLE_APPLICATION_CREDENTIALS または gcloud auth application-default login で認証済み
// - 環境変数:
//   D1_SQLITE_PATH: D1 SQLite ファイルパス (例: ./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite)
//   FIRESTORE_PROJECT_ID: Firestore プロジェクトID
//   TENANT_ID: デフォルト 1
//   DRY_RUN: "true" なら Firestore へ書き込まずログのみ

import Database from 'better-sqlite3'
import { Firestore } from '@google-cloud/firestore'

const dbPath = process.env.D1_SQLITE_PATH || './.wrangler/state/v3/d1/miniflare-D1DatabaseObject/7a321e1c997ab8e153b965c9a6bb80991f6ac35f4a46ec49f72ed2d92fc44616.sqlite'
const projectId = process.env.FIRESTORE_PROJECT_ID
const tenantId = Number(process.env.TENANT_ID || '1')
const dryRun = String(process.env.DRY_RUN || 'true').toLowerCase() === 'true'

if (!projectId) {
  console.error('FIRESTORE_PROJECT_ID が未設定です。')
  process.exit(1)
}

const firestore = new Firestore({ projectId })
const db = new Database(dbPath)

const selectAll = (table) => db.prepare(`SELECT * FROM ${table}`).all()
const nowIso = () => new Date().toISOString()

const migrateTable = async (table, docIdField) => {
  const rows = selectAll(table)
  console.log(`table=${table} rows=${rows.length}`)

  if (dryRun || rows.length === 0) return

  const batch = firestore.batch()
  rows.forEach((row) => {
    const docId = docIdField ? row[docIdField] : undefined
    const ref = docId
      ? firestore.collection(table).doc(String(docId))
      : firestore.collection(table).doc()
    batch.set(ref, { ...row, tenant_id: tenantId, migrated_at: nowIso() })
  })
  await batch.commit()
  console.log(`table=${table} committed ${rows.length} docs`)
}

const main = async () => {
  console.log('--- D1 -> Firestore migrate start ---')
  console.log({ dbPath, projectId, tenantId, dryRun })

  // 必須テーブル
  await migrateTable('jobs', 'job_id')
  await migrateTable('schedules', 'id')
  await migrateTable('schedule_runs', 'id')
  await migrateTable('settings', 'id')

  console.log('--- migrate done ---')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
