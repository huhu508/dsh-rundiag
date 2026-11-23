import {
  applyActivities,
  applyOps,
  loadState,
  mergeClientState,
  nowIso,
  persist,
  publicState,
  sanitizeActivity
} from './state.js'
import { REGIONS, login, probeToken } from './coros.js'
import { syncCoros } from './sync.js'
import { computeCoach } from './coach.js'

const PREFIX = '/rundiag/api'
const MAX_BODY = 3 * 1024 * 1024

class HttpError extends Error {
  constructor(status, message, code = 'bad_request') {
    super(message)
    this.status = status
    this.code = code
  }
}

let state = null
let loading = null
let syncPromise = null

function getState() {
  if (state) return Promise.resolve(state)
  if (!loading) {
    loading = loadState().then((loaded) => {
      state = loaded
      return state
    }, (error) => {
      loading = null
      throw error
    })
  }
  return loading
}

function touch(target) {
  target.revision += 1
  target.updatedAt = nowIso()
}

function writeJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

function fail(res, status, message, code = 'error') {
  writeJson(res, status, { ok: false, error: { code, message } })
}

async function readJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, '请求体过大。', 'too_large')
    chunks.push(chunk)
  }
  if (!size) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, '请求体不是合法 JSON。', 'invalid_json')
  }
}

function currentCoros(target) {
  return target?.integrations?.coros
}

function viewState(target) {
  const state = publicState(target)
  try {
    state.coach = computeCoach(target)
  } catch (error) {
    console.warn('[dsh-rundiag] coach computation failed:', error?.message || error)
    state.coach = null
  }
  return state
}

async function runSync(target, options = {}) {
  const coros = currentCoros(target)
  if (!coros?.token) throw new HttpError(400, '尚未连接 COROS，请先在“同步”页登录。', 'not_connected')
  if (syncPromise) return syncPromise
  syncPromise = (async () => {
    try {
      const { activities, result } = await syncCoros(target, options)
      coros.lastSyncAt = nowIso()
      coros.lastSyncError = null
      touch(target)
      await persist(target)
      return { ...result, activities, fetched: activities.length }
    } catch (error) {
      coros.lastSyncError = String(error?.message || error).slice(0, 800)
      target.updatedAt = nowIso()
      await persist(target).catch(() => {})
      throw error
    } finally {
      syncPromise = null
    }
  })()
  return syncPromise
}

async function connect(target, body) {
  const region = REGIONS[body.region] ? body.region : 'cn'
  const providedToken = String(body.token || '').trim()
  const email = String(body.email || '').trim()
  const password = String(body.password || '')
  let token = providedToken
  let account = email
  let userId = ''
  let displayName = ''
  if (!token) {
    if (!email || !password) throw new HttpError(400, '请填写 COROS 邮箱和密码，或粘贴 accessToken。', 'bad_input')
    const session = await login(region, email, password)
    token = session.token
    account = session.account || email
    userId = session.userId || ''
    displayName = session.name || ''
  } else {
    await probeToken(region, token)
  }
  const coros = currentCoros(target)
  const wasConnected = Boolean(coros.token)
  coros.token = token
  coros.region = region
  coros.account = account || coros.account || ''
  coros.userId = userId || coros.userId || ''
  coros.name = displayName || coros.name || ''
  coros.connectedAt = coros.connectedAt || nowIso()
  coros.lastSyncError = null
  if (!wasConnected) {
    coros.autoSync = true
    coros.autoCreateTasks = true
  }
  touch(target)
  await persist(target)
  let syncError = null
  try {
    await runSync(target, { days: 30 })
  } catch (error) {
    syncError = String(error?.message || error)
  }
  return { syncError }
}

async function disconnect(target) {
  const coros = currentCoros(target)
  coros.token = ''
  coros.account = ''
  coros.name = ''
  coros.userId = ''
  coros.connectedAt = null
  coros.lastSyncError = null
  touch(target)
  await persist(target)
}

async function importActivities(target, body) {
  const rows = Array.isArray(body.activities) ? body.activities.slice(0, 500) : []
  if (!rows.length) throw new HttpError(400, '没有可导入的活动。', 'bad_input')
  const normalized = rows
    .map((row) => sanitizeActivity({ ...row, source: 'manual' }))
    .filter(Boolean)
  if (!normalized.length) throw new HttpError(400, '活动数据缺少 date 字段。', 'bad_input')
  const result = applyActivities(target, normalized)
  touch(target)
  await persist(target)
  return { ...result, imported: normalized.length }
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    fail(res, 405, '只支持 GET / POST。', 'method_not_allowed')
    return
  }
  const url = new URL(req.url || '/', 'http://dsh.internal')
  const suffix = url.pathname.slice(PREFIX.length).replace(/^\/+/, '')
  const target = await getState()

  if (req.method === 'GET') {
    if (suffix === 'state' || suffix === '') {
      writeJson(res, 200, { ok: true, state: viewState(target) })
      return
    }
    if (suffix === 'export') {
      writeJson(res, 200, {
        ok: true,
        exportedAt: nowIso(),
        version: target.version,
        tasks: target.tasks,
        reviews: target.reviews,
        activities: target.activities,
        dailyMetrics: target.dailyMetrics
      })
      return
    }
    fail(res, 404, '接口不存在。', 'not_found')
    return
  }

  const body = await readJson(req)
  if (suffix === 'ops') {
    const result = applyOps(target, body.ops)
    await persist(target)
    writeJson(res, 200, { ok: true, result, state: viewState(target) })
    return
  }
  if (suffix === 'state') {
    mergeClientState(target, body)
    await persist(target)
    writeJson(res, 200, { ok: true, state: viewState(target) })
    return
  }
  if (suffix === 'connect') {
    const extra = await connect(target, body)
    writeJson(res, 200, { ok: true, state: viewState(target), ...extra })
    return
  }
  if (suffix === 'disconnect') {
    await disconnect(target)
    writeJson(res, 200, { ok: true, state: viewState(target) })
    return
  }
  if (suffix === 'sync') {
    const result = await runSync(target, { days: Number(body.days) || 30 })
    writeJson(res, 200, { ok: true, result, state: viewState(target) })
    return
  }
  if (suffix === 'import') {
    const result = await importActivities(target, body)
    writeJson(res, 200, { ok: true, result, state: viewState(target) })
    return
  }
  fail(res, 404, '接口不存在。', 'not_found')
}

export const name = 'dsh-rundiag'
export const inject = ['webServer', 'connection']

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      try {
        if (ctx.connection.requestRejection(req) !== undefined) {
          fail(res, 403, 'forbidden', 'forbidden')
          return
        }
        await handle(req, res)
      } catch (error) {
        if (res.headersSent) {
          try { res.end() } catch { /* already closed */ }
          return
        }
        const status = error instanceof HttpError ? error.status : 500
        const code = error?.code || 'internal_error'
        const message = String(error?.message || '内部错误')
        if (status >= 500) console.warn('[dsh-rundiag]', error)
        fail(res, status, message, code)
      }
    }
  }), 'dsh-rundiag: http routes')

  const timer = setInterval(() => {
    const target = state
    const coros = currentCoros(target)
    if (!target || !coros?.token || !coros.autoSync) return
    runSync(target, { days: 30 }).catch((error) => {
      console.warn('[dsh-rundiag] auto sync failed:', error?.message || error)
    })
  }, 10 * 60 * 1000)
  timer.unref?.()
  ctx.effect(() => () => clearInterval(timer), 'dsh-rundiag: auto sync timer')

  const startup = setTimeout(() => {
    getState().then((target) => {
      const coros = currentCoros(target)
      if (!coros?.token || !coros.autoSync) return
      return runSync(target, { days: 30 })
    }).catch((error) => {
      console.warn('[dsh-rundiag] startup sync failed:', error?.message || error)
    })
  }, 2500)
  startup.unref?.()
  ctx.effect(() => () => clearTimeout(startup), 'dsh-rundiag: startup sync')
}
