// Cloud Run / Node 環境で dist/_worker.js の fetch を立ち上げる簡易エントリ
import { serve } from '@hono/node-server'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { readFile } from 'node:fs/promises'
import worker from './dist/_worker.js'

// google-gax などが __dirname を参照するため ESM でも定義しておく
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// @ts-ignore
globalThis.__dirname = __dirname

const port = Number(process.env.PORT || 8080)

// Cloud Run では環境変数が process.env に載るので、Honoのfetchに明示的に渡す
const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET,
  YOUTUBE_REFRESH_TOKEN: process.env.YOUTUBE_REFRESH_TOKEN,
  APP_CRYPTO_KEY: process.env.APP_CRYPTO_KEY,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  FIRESTORE_PROJECT_ID: process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID,
  TIMEZONE: process.env.TIMEZONE,
  BASIC_USER: process.env.BASIC_USER,
  BASIC_PASS: process.env.BASIC_PASS
}
const handleFetch = worker.fetch.bind(worker)

const mimeMap = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ico': 'image/x-icon'
}

async function tryServeStatic(req) {
  try {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/static/')) {
      const filePath = `${__dirname}/dist${url.pathname}`
      const ext = url.pathname.substring(url.pathname.lastIndexOf('.'))
      const body = await readFile(filePath)
      return new Response(body, { status: 200, headers: { 'Content-Type': mimeMap[ext] || 'application/octet-stream' } })
    }
    if (url.pathname === '/favicon.ico') {
      // dist側にビルドされたアイコンを優先し、なければpublicを参照
      const candidates = [
        `${__dirname}/dist/favicon.ico`,
        `${__dirname}/public/favicon.ico`
      ]
      for (const filePath of candidates) {
        try {
          const body = await readFile(filePath)
          return new Response(body, { status: 200, headers: { 'Content-Type': mimeMap['.ico'] } })
        } catch (_) {
          // continue
        }
      }
      // どこにも無ければ空レスポンスで返して 500 を防ぐ
      return new Response('', { status: 204, headers: { 'Content-Type': mimeMap['.ico'] } })
    }
  } catch (err) {
    console.warn('Static serve failed', err?.message || err)
  }
  return null
}

serve(
  {
    fetch: (req, serverEnv, ctx) => {
      const { pathname } = new URL(req.url)
      if (pathname === '/health') return new Response('ok')
      // static assets (css/js/favicon)
      const staticRes = tryServeStatic(req)
      if (staticRes instanceof Promise) {
        return staticRes.then(res => res || handleFetch(req, env, ctx))
      }
      if (staticRes) return staticRes
      return handleFetch(req, env, ctx)
    },
    port
  },
  (info) => {
    console.log(`Listening on http://localhost:${info.port}`)
  }
)
