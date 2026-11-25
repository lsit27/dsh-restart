/**
 * dsh-restart Host 半边：
 *  - 在 DSH webServer 上挂一条前缀路由 /dsh-restart/api，
 *    GET  /dsh-restart/api/status   → 当前进程、默认模型、端口、日志路径
 *    POST /dsh-restart/api/restart  → 关闭当前 dsh 并重新启动（沿用当前默认模型）
 *  - 重启由独立的后台进程 restart-helper.mjs 完成：等旧进程退出 → 等端口释放 →
 *    用与本次完全相同的 node 入口、参数、工作目录、环境变量重新拉起 dsh。
 *  - 重启前把「当前默认模型」再写一遍配置，保证新进程启动时的默认模型就是它。
 */
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-restart'

/** webServer 是硬依赖：没有它这条路由挂不上去，插件也就没有意义。 */
export const inject = ['webServer']

const HERE = dirname(fileURLToPath(import.meta.url))
const PREFIX = '/dsh-restart/api'
const STARTED_AT = new Date().toISOString()

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function stateDir() {
  const dir = join(dshHome(), 'dsh-restart')
  mkdirSync(dir, { recursive: true })
  return dir
}

function appendLog(file, message) {
  try {
    appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`, 'utf8')
  } catch {
    // 日志失败不影响重启流程
  }
}

function parsePort(origin) {
  try {
    const url = new URL(origin)
    if (url.port !== '') return Number(url.port)
    return url.protocol === 'https:' ? 443 : 80
  } catch {
    return 0
  }
}

/** 读取当前默认模型；服务缺失或读取失败时返回 null，不阻断重启。 */
function readModelSelection(ctx, logger) {
  try {
    const service = ctx.get?.('agentDefaultModel', true)
    const selection = service?.currentSelection?.()
    if (selection && typeof selection === 'object' && typeof selection.model === 'string') {
      return {
        provider: typeof selection.provider === 'string' ? selection.provider : '',
        model: selection.model,
        ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }),
      }
    }
  } catch (error) {
    logger?.(`read default model failed: ${error?.message ?? error}`)
  }
  return null
}

export function apply(ctx) {
  const logger = (message) => {
    try {
      ctx.logger?.info?.(`[dsh-restart] ${message}`)
    } catch {
      // 忽略日志适配差异
    }
  }

  const send = (res, status, body) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(body))
  }

  const origin = () => {
    try {
      return ctx.webServer?.getOrigin?.() ?? ''
    } catch {
      return ''
    }
  }

  const statusPayload = () => {
    const model = readModelSelection(ctx, logger)
    const url = origin()
    return {
      pid: process.pid,
      origin: url,
      port: parsePort(url),
      model,
      startedAt: STARTED_AT,
      node: process.version,
      entry: process.argv[1] ?? '',
      cwd: process.cwd(),
    }
  }

  const scheduleRestart = async (req, res) => {
    const model = readModelSelection(ctx, logger)

    // 先把当前默认模型再保存一次：保证新进程启动时的默认模型＝当前使用的模型。
    if (model !== null) {
      try {
        await ctx.get?.('agentDefaultModel', true)?.saveSelection?.(model)
      } catch (error) {
        // 写入失败不阻断重启，但要让调用方知道这次没能固定模型
        logger(`save default model failed: ${error?.message ?? error}`)
      }
    }

    const url = origin()
    const port = parsePort(url)
    const dir = stateDir()
    const logPath = join(dir, 'restart.log')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const planPath = join(dir, `plan-${stamp}.json`)

    const plan = {
      pid: process.pid,
      execPath: process.execPath,
      argv: process.argv.slice(1),
      cwd: process.cwd(),
      port,
      origin: url,
      model,
      logPath,
      requestedAt: new Date().toISOString(),
      requestedBy: String(req.socket?.remoteAddress ?? ''),
    }

    try {
      writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8')
    } catch (error) {
      send(res, 500, { ok: false, error: `写入重启计划失败：${error?.message ?? error}` })
      return
    }

    appendLog(
      logPath,
      `restart requested (pid=${plan.pid}, port=${port}, model=${model === null ? 'unknown' : `${model.provider}/${model.model}`})`,
    )

    try {
      const helper = spawn(process.execPath, [join(HERE, 'restart-helper.mjs'), planPath], {
        cwd: process.cwd(),
        env: process.env,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      helper.unref()
      appendLog(logPath, `helper spawned (pid=${helper.pid ?? 'unknown'})`)
    } catch (error) {
      appendLog(logPath, `helper spawn failed: ${error?.message ?? error}`)
      send(res, 500, { ok: false, error: `无法启动重启助手：${error?.message ?? error}` })
      return
    }

    send(res, 202, {
      ok: true,
      data: {
        pid: plan.pid,
        port,
        origin: url,
        model,
        logPath,
        message: 'dsh 即将关闭并重新启动',
      },
    })

    // 留出响应刷出的时间，然后由本进程退出（等价于正常关闭 dsh）
    setTimeout(() => {
      appendLog(logPath, `exiting dsh pid=${process.pid}`)
      process.exit(0)
    }, 500)
  }

  ctx.effect?.(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: async (req, res) => {
          try {
            // 宿主连接栅栏：插件前缀路由不经过宿主默认鉴权，这里显式套一层
            let rejection
            try {
              rejection = ctx.get?.('connection', true)?.requestRejection?.(req)
            } catch {
              rejection = undefined
            }
            if (rejection !== undefined) {
              send(res, rejection, {
                ok: false,
                error: rejection === 401 ? '需要浏览器登录凭证' : '拒绝非本机来源的请求',
                code: rejection === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
              })
              return
            }

            const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
            const route = pathname.startsWith(PREFIX) ? pathname.slice(PREFIX.length) || '/' : pathname

            if (route === '/' || route === '/status') {
              if (req.method !== 'GET' && req.method !== 'HEAD') {
                send(res, 405, { ok: false, error: '只支持 GET' })
                return
              }
              send(res, 200, { ok: true, data: statusPayload() })
              return
            }

            if (route === '/restart') {
              if (req.method !== 'POST') {
                send(res, 405, { ok: false, error: '只支持 POST' })
                return
              }
              await scheduleRestart(req, res)
              return
            }

            send(res, 404, { ok: false, error: '未知路由' })
          } catch (error) {
            send(res, 500, { ok: false, error: String(error?.message ?? error) })
          }
        },
      }),
    'dsh-restart-api',
  )

  appendLog(join(stateDir(), 'restart.log'), `plugin loaded (pid=${process.pid}, origin=${origin()})`)
}
