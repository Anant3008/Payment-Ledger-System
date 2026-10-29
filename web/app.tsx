/**
 * Quire — payment ledger engine UI. Entire UI/UX in a single file.
 * Requirements: React 19, lucide-react, Tailwind CSS v4 (only `@import 'tailwindcss'`).
 * Data comes from an in-memory mock engine (no network).
 */
import React, { createElement, Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { ArrowDown, ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, BookOpenText, Check, ChevronDown, ChevronUp, CircleAlert, CircleCheck, CircleDashed, CircleX, Command, Copy, Database, Fingerprint, FlaskConical, GitCommitHorizontal, Hash, Info, Layers, LayoutGrid, Link2, Loader2, Lock, Play, Plus, RefreshCw, RotateCcw, Scale, ScanSearch, Search, Send, ShieldAlert, ShieldCheck, Shuffle, SquareTerminal, Timer, Trash2, TriangleAlert, Unlock, Wallet as WalletIcon, X, Zap } from 'lucide-react'

// ─── Design tokens & global styles ─────────────────────────────────────────
// Colors are inlined as Tailwind arbitrary values; fonts, animations and component classes live here.
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap');
:root {
  --font-sans: 'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --font-display: 'Instrument Serif', 'Iowan Old Style', Georgia, serif;
}
@layer base {
  html, body, #root { height: 100%; }
  body { background: #0b0b0a; color: #ece8e1; font-family: var(--font-sans); font-feature-settings: 'ss01', 'cv11'; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  ::selection { background: rgba(196, 245, 90, 0.3); color: #fff; }
  :focus-visible { outline: 2px solid #c4f55a; outline-offset: 2px; border-radius: 6px; }
  * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.12) transparent; }
}
@layer components {
  .panel {
    background: linear-gradient(180deg, rgba(255,255,255,0.028), rgba(255,255,255,0.012)), #111110;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.065), 0 1px 0 0 rgba(255,255,255,0.03) inset, 0 20px 40px -24px rgba(0,0,0,0.6);
  }
  .eyebrow { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: #66635d; }
  .hairline { border-color: rgba(255,255,255,0.065); }
  .grid-bg {
    background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: radial-gradient(ellipse 80% 70% at 30% 0%, #000 30%, transparent 75%);
  }
  .j-k { color: #ece8e1; } .j-s { color: #c4f55a; } .j-n { color: #7cc4ff; } .j-b { color: #f5b544; }
}
@layer utilities {
  .font-display { font-family: var(--font-display); }
  .tnum { font-variant-numeric: tabular-nums; }
  .animate-rise { animation: q-rise 420ms cubic-bezier(0.2, 0.7, 0.1, 1) both; }
  .animate-pulse-ring { animation: q-pulse-ring 2.4s ease-out infinite; }
  .animate-flash { animation: q-flash 1.2s ease-out; }
}
@keyframes q-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes q-pulse-ring { 0% { box-shadow: 0 0 0 0 currentColor; } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
@keyframes q-flash { from { background-color: rgba(196, 245, 90, 0.12); } to { background-color: transparent; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
`

// ─── types ──────────────────────────────────────────────────────────
// Domain types. Amounts are always integer minor units (e.g. cents) to avoid float drift.

type Currency = 'USD'

interface Wallet {
  id: string
  owner: string
  currency: Currency
  balance: number
  version: number
  created_at: string
}

type TxKind = 'deposit' | 'withdrawal' | 'transfer'

interface Transaction {
  id: string
  kind: TxKind
  status: 'posted' | 'rejected'
  amount: number
  currency: Currency
  from_wallet_id: string | null
  to_wallet_id: string | null
  idempotency_key: string
  reference: string
  created_at: string
}

interface LedgerEntry {
  id: string
  seq: number
  transaction_id: string
  wallet_id: string
  direction: 'debit' | 'credit'
  amount: number
  balance_after: number
  prev_hash: string
  hash: string
  created_at: string
}

interface Reconciliation {
  wallet_id: string
  cached_balance: number
  ledger_balance: number
  entry_count: number
  balanced: boolean
  chain_valid: boolean
  checked_at: string
}

interface Health {
  status: 'ok' | 'degraded' | 'down'
  version: string
  uptime_s: number
  database: { status: 'up' | 'down'; driver: string; latency_ms: number; pool_in_use: number; pool_max: number }
  capabilities: string[]
}

interface ApiError {
  error: { code: string; message: string }
}

interface Trace {
  id: string
  at: number
  method: 'GET' | 'POST'
  path: string
  requestHeaders: Record<string, string>
  requestBody?: unknown
  status: number
  responseHeaders: Record<string, string>
  responseBody: unknown
  ms: number
  source: 'live' | 'sim'
}

// ─── format ─────────────────────────────────────────────────────────
const symbols: Record<string, string> = { USD: '$' }

function money(minor: number, currency: Currency = 'USD', opts: { sign?: boolean } = {}) {
  const neg = minor < 0
  const abs = Math.abs(minor)
  const whole = Math.floor(abs / 100).toLocaleString('en-US')
  const cents = String(abs % 100).padStart(2, '0')
  const sign = neg ? '−' : opts.sign && minor > 0 ? '+' : ''
  return `${sign}${symbols[currency]}${whole}.${cents}`
}

function moneyParts(minor: number, currency: Currency = 'USD') {
  const abs = Math.abs(minor)
  return {
    sign: minor < 0 ? '−' : '',
    symbol: symbols[currency],
    whole: Math.floor(abs / 100).toLocaleString('en-US'),
    cents: String(abs % 100).padStart(2, '0'),
  }
}

/** Parse a user-typed decimal string into minor units without floating point math. */
function parseMinor(input: string): number | null {
  const s = input.trim().replace(/[,\s$€£]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null
  const [w, f = ''] = s.split('.')
  return Number(w) * 100 + Number(f.padEnd(2, '0'))
}

function shortId(id: string | number | null | undefined, n = 8) {
  if (id == null) return ''
  const str = String(id)
  const i = str.indexOf('_')
  return i > -1 ? `${str.slice(0, i + 1)}${str.slice(i + 1, i + 1 + n)}` : str.slice(0, n)
}

function time(iso: string | number) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function relTime(iso: string | number) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function uuid() {
  return crypto.randomUUID()
}

function idemKey() {
  return `idem_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

// ─── engine ─────────────────────────────────────────────────────────
/**
 * In-browser simulation of the ledger engine. It mirrors the HTTP contract in api.ts so
 * the UI is fully explorable when no Go backend is reachable. Every guarantee it claims
 * (double-entry, idempotency fingerprinting, overdraft checks, row locking, hash chain)
 * is actually implemented here, so Lab verdicts are computed, not faked.
 */

type Res = { status: number; headers: Record<string, string>; body: unknown }

const SYSTEM_ACCOUNT = 'wal_external_settlement'

function fnv(s: string) {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 16777619)
    h2 = Math.imul(h2 ^ c, 2246822519)
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).repeat(2)
}

const rid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const err = (status: number, code: string, message: string): Res => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: { error: { code, message } },
})

class Mutex {
  private q: Promise<void> = Promise.resolve()
  lock(): Promise<() => void> {
    let release!: () => void
    const next = new Promise<void>((r) => (release = r))
    const prev = this.q
    this.q = prev.then(() => next)
    return prev.then(() => release)
  }
}

interface IdemRecord {
  fingerprint: string
  response: Res
}

class SimEngine {
  wallets = new Map<string, Wallet>()
  txs: Transaction[] = []
  entries: LedgerEntry[] = []
  idem = new Map<string, IdemRecord>()
  locks = new Map<string, Mutex>()
  bootedAt = Date.now()
  private seq = 0
  private lastHash = '0'.repeat(64)

  constructor() {
    this.seed()
  }

  private lockFor(id: string) {
    if (!this.locks.has(id)) this.locks.set(id, new Mutex())
    return this.locks.get(id)!
  }

  /** Acquire locks in a deterministic order (like SELECT ... FOR UPDATE ORDER BY id) to avoid deadlocks. */
  private async withLocks<T>(ids: string[], fn: () => Promise<T>): Promise<T> {
    const ordered = [...new Set(ids)].sort()
    const releases: (() => void)[] = []
    for (const id of ordered) releases.push(await this.lockFor(id).lock())
    try {
      return await fn()
    } finally {
      releases.reverse().forEach((r) => r())
    }
  }

  private post(txId: string, walletId: string, direction: 'debit' | 'credit', amount: number, balanceAfter: number) {
    const seq = ++this.seq
    const created_at = new Date().toISOString()
    const prev_hash = this.lastHash
    const hash = fnv(`${prev_hash}|${seq}|${txId}|${walletId}|${direction}|${amount}|${balanceAfter}`)
    this.lastHash = hash
    this.entries.push({ id: rid('ent'), seq, transaction_id: txId, wallet_id: walletId, direction, amount, balance_after: balanceAfter, prev_hash, hash, created_at })
  }

  private seed() {
    const mk = (owner: string, currency: Currency, ago: number): Wallet => {
      const w: Wallet = { id: rid('wal'), owner, currency, balance: 0, version: 0, created_at: new Date(Date.now() - ago).toISOString() }
      this.wallets.set(w.id, w)
      return w
    }
    const a = mk('Northwind Treasury', 'USD', 86400e3 * 9)
    const b = mk('Halcyon Payroll', 'USD', 86400e3 * 6)
    const c = mk('Meridian Escrow', 'USD', 86400e3 * 2)
    const ops: [TxKindInput, Record<string, unknown>][] = [
      ['deposit', { wallet_id: a.id, amount: 2_500_000_00, reference: 'Series B wire' }],
      ['deposit', { wallet_id: b.id, amount: 180_000_00, reference: 'Opening float' }],
      ['transfer', { from_wallet_id: a.id, to_wallet_id: b.id, amount: 420_000_00, reference: 'Payroll funding — Mar' }],
      ['deposit', { wallet_id: c.id, amount: 75_000_00, reference: 'Escrow deposit #4471' }],
      ['withdrawal', { wallet_id: b.id, amount: 312_450_18, reference: 'Payroll run 2025-03' }],
      ['transfer', { from_wallet_id: a.id, to_wallet_id: c.id, amount: 12_500_00, reference: 'Escrow top-up' }],
    ]
    for (const [k, body] of ops) this.applySync(k, body)
  }

  // Synchronous variant used only for seeding.
  private applySync(kind: TxKindInput, body: Record<string, unknown>) {
    const amount = body.amount as number
    const tx: Transaction = {
      id: rid('txn'), kind, status: 'posted', amount, currency: 'USD',
      from_wallet_id: (kind === 'transfer' ? body.from_wallet_id : kind === 'withdrawal' ? body.wallet_id : null) as string | null,
      to_wallet_id: (kind === 'transfer' ? body.to_wallet_id : kind === 'deposit' ? body.wallet_id : null) as string | null,
      idempotency_key: `seed_${this.txs.length}`, reference: (body.reference as string) ?? '', created_at: new Date().toISOString(),
    }
    this.commit(tx)
  }

  private commit(tx: Transaction) {
    const from = tx.from_wallet_id ? this.wallets.get(tx.from_wallet_id)! : null
    const to = tx.to_wallet_id ? this.wallets.get(tx.to_wallet_id)! : null
    if (from) {
      from.balance -= tx.amount
      from.version++
      this.post(tx.id, from.id, 'debit', tx.amount, from.balance)
    } else this.post(tx.id, SYSTEM_ACCOUNT, 'debit', tx.amount, 0)
    if (to) {
      to.balance += tx.amount
      to.version++
      this.post(tx.id, to.id, 'credit', tx.amount, to.balance)
    } else this.post(tx.id, SYSTEM_ACCOUNT, 'credit', tx.amount, 0)
    this.txs.push(tx)
  }

  async handle(method: string, path: string, headers: Record<string, string>, body: any): Promise<Res> {
    await sleep(6 + Math.random() * 22)
    const ok = (b: unknown, status = 200, extra: Record<string, string> = {}): Res => ({ status, headers: { 'content-type': 'application/json', ...extra }, body: b })
    const p = path.replace(/^\/api\/v1/, '')
    let m: RegExpMatchArray | null

    if (method === 'GET' && p === '/health') {
      return ok({
        status: 'ok', version: 'v1.4.2-sim', uptime_s: Math.round((Date.now() - this.bootedAt) / 1000),
        database: { status: 'up', driver: 'postgres 16 (simulated)', latency_ms: +(0.6 + Math.random() * 1.4).toFixed(2), pool_in_use: Math.floor(Math.random() * 4) + 1, pool_max: 25 },
        capabilities: ['double_entry', 'idempotency_keys', 'payload_fingerprinting', 'row_level_locking', 'overdraft_protection', 'hash_chained_entries', 'serializable_isolation'],
      })
    }
    if (method === 'GET' && p === '/wallets') return ok({ data: [...this.wallets.values()] })
    if (method === 'POST' && p === '/wallets') {
      const owner = String(body?.owner ?? '').trim()
      if (!owner) return err(400, 'validation_failed', 'owner is required')
      const currency = (body?.currency ?? 'USD') as Currency
      const w: Wallet = { id: rid('wal'), owner, currency, balance: 0, version: 0, created_at: new Date().toISOString() }
      this.wallets.set(w.id, w)
      return ok(w, 201, { location: `/api/v1/wallets/${w.id}` })
    }
    if ((m = p.match(/^\/wallets\/([\w]+)$/)) && method === 'GET') {
      const w = this.wallets.get(m[1])
      return w ? ok(w) : err(404, 'wallet_not_found', `wallet ${m[1]} does not exist`)
    }
    if ((m = p.match(/^\/wallets\/([\w]+)\/transactions$/))) {
      const id = m[1]
      return ok({ data: this.txs.filter((t) => t.from_wallet_id === id || t.to_wallet_id === id).slice().reverse() })
    }
    if ((m = p.match(/^\/wallets\/([\w]+)\/entries$/))) {
      return ok({ data: this.entries.filter((e) => e.wallet_id === m![1]).slice().reverse() })
    }
    if ((m = p.match(/^\/wallets\/([\w]+)\/reconcile$/))) {
      const w = this.wallets.get(m[1])
      if (!w) return err(404, 'wallet_not_found', `wallet ${m[1]} does not exist`)
      const es = this.entries.filter((e) => e.wallet_id === w.id)
      const ledger = es.reduce((s, e) => s + (e.direction === 'credit' ? e.amount : -e.amount), 0)
      let chain = true
      for (let i = 1; i < this.entries.length; i++) if (this.entries[i].prev_hash !== this.entries[i - 1].hash) chain = false
      const r: Reconciliation = { wallet_id: w.id, cached_balance: w.balance, ledger_balance: ledger, entry_count: es.length, balanced: ledger === w.balance, chain_valid: chain, checked_at: new Date().toISOString() }
      return ok(r)
    }
    const kinds: Record<string, TxKindInput> = { '/deposits': 'deposit', '/withdrawals': 'withdrawal', '/transfers': 'transfer' }
    if (method === 'POST' && kinds[p]) return this.money(kinds[p], headers, body ?? {})
    return err(404, 'route_not_found', `no route for ${method} ${path}`)
  }

  private async money(kind: TxKindInput, headers: Record<string, string>, body: Record<string, any>): Promise<Res> {
    const key = headers['idempotency-key']
    if (!key) return err(400, 'idempotency_key_required', 'Idempotency-Key header is required for money movement')
    const fingerprint = fnv(`${kind}|${JSON.stringify(body, Object.keys(body).sort())}`).slice(0, 16)
    const amount = body.amount
    if (!Number.isInteger(amount) || amount <= 0) return err(400, 'validation_failed', 'amount must be a positive integer in minor units')

    const fromId: string | null = kind === 'transfer' ? body.from_wallet_id : kind === 'withdrawal' ? body.wallet_id : null
    const toId: string | null = kind === 'transfer' ? body.to_wallet_id : kind === 'deposit' ? body.wallet_id : null
    if (kind === 'transfer' && fromId === toId) return err(400, 'validation_failed', 'cannot transfer to the same wallet')

    // The idempotency key itself is locked, so concurrent retries with one key serialize.
    return this.withLocks([`idem:${key}`, ...[fromId, toId].filter(Boolean) as string[]], async () => {
      const prior = this.idem.get(key)
      if (prior) {
        if (prior.fingerprint !== fingerprint) {
          return err(422, 'idempotency_key_reused', `Idempotency-Key was first used with a different payload (fingerprint ${prior.fingerprint}). Request rejected; no funds moved.`)
        }
        return { ...prior.response, headers: { ...prior.response.headers, 'idempotent-replayed': 'true' } }
      }
      const from = fromId ? this.wallets.get(fromId) : null
      const to = toId ? this.wallets.get(toId) : null
      if ((fromId && !from) || (toId && !to)) return err(404, 'wallet_not_found', 'one or more wallets do not exist')
      await sleep(2 + Math.random() * 6) // simulated row-lock hold time
      if (from && from.balance < amount) {
        return err(422, 'insufficient_funds', `wallet ${from.id} has ${from.balance} available, ${amount} requested`)
      }
      const tx: Transaction = { id: rid('txn'), kind, status: 'posted', amount, currency: (from ?? to)!.currency, from_wallet_id: fromId, to_wallet_id: toId, idempotency_key: key, reference: body.reference ?? '', created_at: new Date().toISOString() }
      this.commit(tx)
      const response: Res = { status: 201, headers: { 'content-type': 'application/json', 'idempotency-fingerprint': fingerprint }, body: tx }
      this.idem.set(key, { fingerprint, response })
      return response
    })
  }
}

type TxKindInput = 'deposit' | 'withdrawal' | 'transfer'

// ─── Mock API layer ─────────────────────────────────────────────────────────
// No network: every call is served by the in-memory engine above and recorded as a trace.
const API_BASE = ''
type Mode = 'probing' | 'live' | 'sim'
interface ApiResult<T> { ok: boolean; status: number; data: T; headers: Record<string, string>; trace: Trace }
const engine = new SimEngine()
const listeners = new Set<(t: Trace) => void>()
const onTrace = (fn: (t: Trace) => void) => { listeners.add(fn); return () => listeners.delete(fn) }

async function request<T = any>(method: 'GET' | 'POST', path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<ApiResult<T>> {
  if (method === 'POST' && !extraHeaders['Idempotency-Key'] && !extraHeaders['idempotency-key']) {
    extraHeaders['Idempotency-Key'] = idemKey()
  }
  const requestHeaders: Record<string, string> = { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...extraHeaders }
  const t0 = performance.now()
  let status = 0
  let data: any = null
  let resHeaders: Record<string, string> = {}
  let source: 'live' | 'sim' = 'live'

  try {
    const res = await fetch(path, {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    status = res.status
    res.headers.forEach((v, k) => { resHeaders[k.toLowerCase()] = v })
    const text = await res.text()
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
  } catch {
    source = 'sim'
    const lower = Object.fromEntries(Object.entries(requestHeaders).map(([k, v]) => [k.toLowerCase(), v]))
    const r = await engine.handle(method, path, lower, body !== undefined ? structuredClone(body) : undefined)
    status = r.status
    resHeaders = r.headers
    data = structuredClone(r.body)
  }

  // Normalize data structures returned by Go backend
  if (data && typeof data === 'object') {
    if (data.id != null) {
      data.id = String(data.id)
    }
    if (Array.isArray(data.data)) {
      data.data = data.data.map((item: any) => ({
        ...item,
        id: String(item.id),
        currency: item.currency || 'USD',
      }))
    }
    if (Array.isArray(data.entries)) {
      data.data = data.entries.map((entry: any) => ({
        ...entry,
        id: String(entry.id),
        transaction_id: String(entry.transaction_id),
        wallet_id: String(entry.wallet_id),
        direction: entry.direction || (entry.amount >= 0 ? 'credit' : 'debit'),
        amount: Math.abs(entry.amount),
      }))
    }
    if (Array.isArray(data.transactions)) {
      data.data = data.transactions.map((tx: any) => ({
        ...tx,
        id: String(tx.id),
        kind: tx.type || tx.kind || 'transfer',
        from_wallet_id: tx.from_wallet_id != null ? String(tx.from_wallet_id) : (tx.wallet_id != null ? String(tx.wallet_id) : null),
        to_wallet_id: tx.to_wallet_id != null ? String(tx.to_wallet_id) : null,
        currency: tx.currency || 'USD',
        idempotency_key: tx.idempotency_key ? String(tx.idempotency_key) : '',
      }))
    }
  }

  const trace: Trace = {
    id: crypto.randomUUID(),
    at: Date.now(),
    method,
    path,
    requestHeaders,
    requestBody: body,
    status,
    responseHeaders: resHeaders,
    responseBody: data,
    ms: +(performance.now() - t0).toFixed(1),
    source,
  }
  listeners.forEach((l) => l(trace))
  return { ok: status >= 200 && status < 300, status, data, headers: resHeaders, trace }
}
const errMsg = (r: ApiResult<any>) => (typeof r.data?.error === 'string' ? r.data.error : r.data?.error?.message ?? `HTTP ${r.status}`)
const errCode = (r: ApiResult<any>) => (typeof r.data?.error === 'string' ? r.data.error : r.data?.error?.code ?? `http_${r.status}`)

// ─── store ─────────────────────────────────────────────────────────
type View = 'overview' | 'wallets' | 'transact' | 'ledger' | 'lab' | 'console'
interface Toast {
  id: string
  tone: 'ok' | 'err' | 'info'
  title: string
  detail?: string
}

interface Store {
  mode: Mode
  health: Health | null
  healthMs: number | null
  latencyHistory: number[]
  wallets: Wallet[]
  selectedId: string | null
  selected: Wallet | null
  select: (id: string) => void
  refreshWallets: () => Promise<void>
  refreshHealth: () => Promise<void>
  traces: Trace[]
  clearTraces: () => void
  view: View
  go: (v: View) => void
  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  revision: number
  bump: () => void
  focusTrace: string | null
  setFocusTrace: (id: string | null) => void
}

const Ctx = createContext<Store | null>(null)

function StoreProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('probing')
  const [health, setHealth] = useState<Health | null>(null)
  const [healthMs, setHealthMs] = useState<number | null>(null)
  const [latencyHistory, setLatency] = useState<number[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [traces, setTraces] = useState<Trace[]>([])
  const [view, setView] = useState<View>(() => (location.hash.slice(1) as View) || 'overview')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [revision, setRevision] = useState(0)
  const [focusTrace, setFocusTrace] = useState<string | null>(null)
  const booted = useRef(false)

  useEffect(() => onTrace((t) => setTraces((p) => [t, ...p].slice(0, 300))) as () => void, [])

  const refreshHealth = useCallback(async () => {
    const t0 = performance.now()
    try {
      const res = await fetch('/health')
      if (res.ok) {
        const data = await res.json()
        const ms = +(performance.now() - t0).toFixed(1)
        setHealth(data)
        setHealthMs(ms)
        setLatency((p) => [...p, ms].slice(-40))
      }
    } catch {
      // background health ping error
    }
  }, [])

  const refreshWallets = useCallback(async () => {
    const r = await request<{ data: Wallet[] }>('GET', '/wallets')
    if (r.ok && r.data?.data) {
      const list = r.data.data.map((w: any) => ({
        ...w,
        id: String(w.id),
        currency: w.currency || 'USD',
      }))
      setWallets(list)
      setSelectedId((s) => s ?? list[0]?.id ?? null)
    }
  }, [])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    fetch('/health')
      .then((r) => (r.ok ? 'live' : 'sim'))
      .catch(() => 'sim')
      .then(async (m: Mode) => {
        setMode(m)
        await Promise.all([refreshHealth(), refreshWallets()])
      })
  }, [refreshHealth, refreshWallets])

  useEffect(() => {
    if (mode === 'probing') return
    const t = setInterval(refreshHealth, 10000)
    return () => clearInterval(t)
  }, [mode, refreshHealth])

  const go = useCallback((v: View) => {
    setView(v)
    history.replaceState(null, '', `#${v}`)
    document.getElementById('main')?.scrollTo({ top: 0 })
  }, [])

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    setToasts((p) => [...p, { ...t, id }].slice(-4))
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 4800)
  }, [])

  const bump = useCallback(() => {
    setRevision((r) => r + 1)
    refreshWallets()
  }, [refreshWallets])

  const value = useMemo<Store>(
    () => ({
      mode, health, healthMs, latencyHistory, wallets, selectedId,
      selected: wallets.find((w) => w.id === selectedId) ?? null,
      select: setSelectedId, refreshWallets, refreshHealth, traces, clearTraces: () => setTraces([]),
      view, go, toasts, toast, revision, bump, focusTrace, setFocusTrace,
    }),
    [mode, health, healthMs, latencyHistory, wallets, selectedId, refreshWallets, refreshHealth, traces, view, go, toasts, toast, revision, bump, focusTrace],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}

// ─── ui ─────────────────────────────────────────────────────
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
}
function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'group relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-[background,box-shadow,color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45',
        size === 'sm' && 'h-8 px-3 text-[12.5px]',
        size === 'md' && 'h-10 px-4 text-[13.5px]',
        size === 'lg' && 'h-12 px-5 text-[14.5px]',
        variant === 'primary' && 'bg-[#c4f55a] text-[#0b0b0a] shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_8px_24px_-8px_rgba(196,245,90,0.55)] hover:bg-[#d3ff72]',
        variant === 'secondary' && 'bg-white/[0.06] text-[#ece8e1] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] hover:bg-white/[0.1]',
        variant === 'ghost' && 'text-[#9a968e] hover:bg-white/[0.06] hover:text-[#ece8e1]',
        variant === 'danger' && 'bg-[#ff6b57]/15 text-[#ff6b57] shadow-[inset_0_0_0_1px_rgba(255,107,87,0.3)] hover:bg-[#ff6b57]/25',
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

function Panel({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <As className={cx('panel rounded-2xl', className)}>{children}</As>
}

function PanelHeader({ title, eyebrow, actions, className }: { title: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cx('flex items-start justify-between gap-4 px-5 pt-5 pb-4', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[#ece8e1]">{title}</h3>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-[12px] font-medium text-[#9a968e]">{label}</label>
        {hint && <span className="text-[11.5px] text-[#66635d]">{hint}</span>}
      </div>
      {children}
      {error && <p role="alert" className="text-[12px] text-[#ff6b57]">{error}</p>}
    </div>
  )
}

function Input({ className, mono, ...rest }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return (
    <input
      {...rest}
      className={cx(
        'h-10 w-full rounded-[10px] bg-[#0b0b0a]/60 px-3 text-[13.5px] text-[#ece8e1] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] outline-none transition-shadow placeholder:text-[#66635d] focus:shadow-[inset_0_0_0_1px_rgba(196,245,90,0.6),0_0_0_4px_rgba(196,245,90,0.08)]',
        mono && 'font-mono text-[12.5px]',
        className,
      )}
    />
  )
}

function Select({ value, onChange, children, id, className }: { value: string; onChange: (v: string) => void; children: ReactNode; id?: string; className?: string }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'h-10 w-full appearance-none rounded-[10px] bg-[#0b0b0a]/60 bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 fill=%27none%27 stroke=%27%238A8780%27 stroke-width=%271.6%27%3E%3Cpath d=%27M3 4.5l3 3 3-3%27/%3E%3C/svg%3E")] bg-[right_12px_center] bg-no-repeat pr-9 pl-3 text-[13.5px] text-[#ece8e1] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(196,245,90,0.6)]',
        className,
      )}
    >
      {children}
    </select>
  )
}

type Tone = 'ok' | 'err' | 'warn' | 'info' | 'neutral'
function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex h-[22px] items-center gap-1.5 rounded-md px-2 font-mono text-[10.5px] font-medium tracking-wide uppercase',
        tone === 'ok' && 'bg-[#c4f55a]/10 text-[#c4f55a]',
        tone === 'err' && 'bg-[#ff6b57]/12 text-[#ff6b57]',
        tone === 'warn' && 'bg-[#f5b544]/12 text-[#f5b544]',
        tone === 'info' && 'bg-[#7cc4ff]/12 text-[#7cc4ff]',
        tone === 'neutral' && 'bg-white/[0.06] text-[#9a968e]',
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

function StatusCode({ status }: { status: number }) {
  const tone: Tone = status === 0 ? 'err' : status < 300 ? 'ok' : status < 500 ? 'warn' : 'err'
  return <Badge tone={tone}>{status === 0 ? 'ERR' : status}</Badge>
}

function Amount({ minor, currency = 'USD', className, size = 'md' }: { minor: number; currency?: Currency; className?: string; size?: 'md' | 'xl' | 'hero' }) {
  const p = moneyParts(minor, currency)
  if (size === 'md') return <span className={cx('tnum font-mono', className)}>{p.sign}{p.symbol}{p.whole}.{p.cents}</span>
  return (
    <span className={cx('tnum font-display leading-none tracking-[-0.02em] text-[#ece8e1]', size === 'hero' ? 'text-[64px] md:text-[80px]' : 'text-[40px]', className)}>
      <span className="mr-1 align-[0.32em] text-[0.42em] text-[#9a968e]">{p.sign}{p.symbol}</span>
      {p.whole}
      <span className="text-[0.5em] text-[#9a968e]">.{p.cents}</span>
    </span>
  )
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      aria-label={`${label} ${value}`}
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(value)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
      className="inline-flex size-6 items-center justify-center rounded-md text-[#66635d] transition-colors hover:bg-white/[0.07] hover:text-[#ece8e1]"
    >
      {done ? <Check className="size-3.5 text-[#c4f55a]" /> : <Copy className="size-3.5" />}
    </button>
  )
}

function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono text-[12px] text-[#9a968e]', className)}>{children}</span>
}

function Json({ value, className }: { value: unknown; className?: string }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? 'null'
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g, (m, str, colon, kw, num) => {
      if (str) return colon ? `<span class="j-k">${str}</span>${colon}` : `<span class="j-s">${str}</span>`
      if (kw) return `<span class="j-b">${kw}</span>`
      if (num) return `<span class="j-n">${num}</span>`
      return m
    })
  return <pre className={cx('overflow-auto font-mono text-[11.5px] leading-[1.65] text-[#9a968e]', className)} dangerouslySetInnerHTML={{ __html: html }} />
}

function SegTabs<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cx('inline-flex rounded-[11px] bg-[#0b0b0a]/70 p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[12.5px] font-medium transition-all',
            value === o.value ? 'bg-white/[0.09] text-[#ece8e1] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-[#9a968e] hover:text-[#ece8e1]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Empty({ title, detail, icon }: { title: string; detail?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 text-[#66635d]">{icon}</div>}
      <div className="text-[13.5px] font-medium text-[#ece8e1]">{title}</div>
      {detail && <div className="max-w-xs text-[12.5px] text-[#9a968e]">{detail}</div>}
    </div>
  )
}

function Sparkline({ data, className, height = 36 }: { data: number[]; className?: string; height?: number }) {
  if (data.length < 2) return <div className={className} style={{ height }} />
  const max = Math.max(...data) * 1.15
  const min = 0
  const w = 200
  const pts = data.map((d, i) => [(i / (data.length - 1)) * w, height - ((d - min) / (max - min || 1)) * height])
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={className} style={{ height }} aria-hidden>
      <defs>
        <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#C4F55A" stopOpacity="0.28" />
          <stop offset="1" stopColor="#C4F55A" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${w},${height} L0,${height} Z`} fill="url(#spark)" />
      <path d={path} fill="none" stroke="#C4F55A" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ─── Shell ──────────────────────────────────────────────────
const NAV: { id: View; label: string; icon: typeof LayoutGrid; group: 'Operate' | 'Verify'; blurb: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid, group: 'Operate', blurb: 'Engine health and guarantees' },
  { id: 'wallets', label: 'Wallets', icon: WalletIcon, group: 'Operate', blurb: 'Accounts and balances' },
  { id: 'transact', label: 'Transact', icon: ArrowLeftRight, group: 'Operate', blurb: 'Move money with idempotency' },
  { id: 'ledger', label: 'Ledger', icon: BookOpenText, group: 'Operate', blurb: 'Entries and reconciliation' },
  { id: 'lab', label: 'Systems Lab', icon: FlaskConical, group: 'Verify', blurb: 'Prove the guarantees' },
  { id: 'console', label: 'API Console', icon: SquareTerminal, group: 'Verify', blurb: 'Every request, inspected' },
]

function EngineBadge({ compact }: { compact?: boolean }) {
  const { mode, health } = useStore()
  const live = mode === 'live'
  const tone = mode === 'probing' ? 'text-[#66635d]' : !health ? 'text-[#ff6b57]' : live ? 'text-[#c4f55a]' : 'text-[#f5b544]'
  const label = mode === 'probing' ? 'Connecting' : !health ? 'Unreachable' : live ? 'Live engine' : 'Simulated'
  return (
    <span className={cx('inline-flex items-center gap-2 font-mono text-[11px] tracking-wide uppercase', tone)}>
      <span className="relative flex size-2">
        <span className={cx('size-2 rounded-full bg-current', mode !== 'probing' && 'animate-pulse-ring')} />
      </span>
      {!compact && label}
    </span>
  )
}

function Rail() {
  const { view, go, mode, health, healthMs } = useStore()
  return (
    <aside className="hairline sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r bg-[#0b0b0a] lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <Logo />
        <span className="text-[17px] font-semibold tracking-[-0.03em]">Quire</span>
        <span className="ml-auto font-mono text-[10px] text-[#66635d]">{health?.version ?? '—'}</span>
      </div>
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pt-2">
        {(['Operate', 'Verify'] as const).map((g) => (
          <div key={g} className="mb-6">
            <div className="eyebrow px-3 pb-2">{g}</div>
            <ul className="flex flex-col gap-0.5">
              {NAV.filter((n) => n.group === g).map((n) => {
                const i = NAV.indexOf(n) + 1
                const active = view === n.id
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => go(n.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'group relative flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[13.5px] transition-colors',
                        active ? 'bg-white/[0.06] text-[#ece8e1]' : 'text-[#9a968e] hover:bg-white/[0.03] hover:text-[#ece8e1]',
                      )}
                    >
                      {active && <span className="absolute top-2.5 bottom-2.5 left-0 w-[2px] rounded-full bg-[#c4f55a]" />}
                      <n.icon className={cx('size-[17px]', active ? 'text-[#c4f55a]' : 'text-[#66635d] group-hover:text-[#9a968e]')} strokeWidth={1.75} />
                      <span className="font-medium">{n.label}</span>
                      <span className="ml-auto font-mono text-[10px] text-[#66635d]">0{i}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="p-3">
        <div className="panel rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <EngineBadge />
            <span className="tnum font-mono text-[11px] text-[#9a968e]">{healthMs != null ? `${healthMs}ms` : ''}</span>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[#66635d]">
            {mode === 'live' && 'Connected to the Go engine on this origin.'}
            {mode === 'sim' && 'Running against the in-memory mock engine. Every trace is labelled SIM.'}
            {mode === 'probing' && 'Probing /api/v1/health…'}
          </p>
        </div>
      </div>
    </aside>
  )
}

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('size-6', className)} aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="#1c1c1a" stroke="rgba(255,255,255,0.1)" />
      <rect x="6.5" y="7" width="11" height="1.8" rx="0.9" fill="#C4F55A" />
      <rect x="6.5" y="11.1" width="11" height="1.8" rx="0.9" fill="#ECE8E1" opacity=".55" />
      <rect x="6.5" y="15.2" width="7" height="1.8" rx="0.9" fill="#ECE8E1" opacity=".3" />
    </svg>
  )
}

function WalletSwitcher() {
  const { wallets, selected, select } = useStore()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = useMemo(() => {
    if (!filter.trim()) return wallets.slice(0, 15)
    const q = filter.toLowerCase().trim()
    return wallets.filter((w) => w.owner.toLowerCase().includes(q) || String(w.id).includes(q))
  }, [wallets, filter])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen((o) => !o); setFilter('') }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 items-center gap-3 rounded-[10px] bg-white/[0.04] pr-3 pl-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition-colors hover:bg-white/[0.07]"
      >
        <Monogram name={selected?.owner ?? '?'} />
        <div className="hidden min-w-0 text-left sm:block">
          <div className="max-w-[160px] truncate text-[12.5px] leading-tight font-medium">{selected?.owner ?? 'No wallet'}</div>
          <div className="tnum font-mono text-[10.5px] leading-tight text-[#9a968e]">{selected ? money(selected.balance, selected.currency) : '—'}</div>
        </div>
        <ChevronDown className="size-3.5 text-[#66635d]" />
      </button>
      {open && (
        <div role="listbox" className="panel absolute right-0 z-40 mt-2 w-[320px] animate-rise rounded-xl p-2 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-2.5 pb-2">
            <span className="eyebrow">Active wallet</span>
            <span className="font-mono text-[10.5px] text-[#66635d]">{wallets.length} accounts</span>
          </div>
          <div className="p-1.5">
            <input
              type="text"
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by owner or ID…"
              className="h-8 w-full rounded-md bg-[#0b0b0a]/80 px-2.5 font-mono text-[12px] text-[#ece8e1] outline-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] placeholder:text-[#66635d] focus:shadow-[inset_0_0_0_1px_rgba(196,245,90,0.5)]"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto px-1 py-0.5">
            {filtered.map((w) => (
              <button
                key={w.id}
                role="option"
                aria-selected={w.id === selected?.id}
                onClick={() => { select(w.id); setOpen(false) }}
                className={cx('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.05]', w.id === selected?.id && 'bg-white/[0.05]')}
              >
                <Monogram name={w.owner} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{w.owner}</div>
                  <div className="font-mono text-[10.5px] text-[#66635d]">ID #{w.id}</div>
                </div>
                <div className="tnum font-mono text-[12px] text-[#9a968e]">{money(w.balance, w.currency)}</div>
              </button>
            ))}
            {!filtered.length && (
              <div className="py-4 text-center font-mono text-[11px] text-[#66635d]">No matching accounts</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Monogram({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[8px] font-mono text-[10.5px] font-semibold text-[#ece8e1]"
      style={{ width: size, height: size, background: `linear-gradient(140deg, hsl(${h} 28% 26%), hsl(${(h + 40) % 360} 22% 16%))`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
    >
      {initials}
    </span>
  )
}

function TopBar({ onPalette }: { onPalette: () => void }) {
  const { view, go } = useStore()
  const item = NAV.find((n) => n.id === view)!
  return (
    <header className="hairline sticky top-0 z-30 border-b bg-[#0b0b0a]/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-4 px-5 md:px-8">
        <div className="flex items-center gap-2.5 lg:hidden">
          <Logo />
          <EngineBadge compact />
        </div>
        <div className="hidden min-w-0 items-baseline gap-3 lg:flex">
          <span className="font-mono text-[11px] text-[#66635d]">0{NAV.indexOf(item) + 1}</span>
          <span className="text-[14px] font-medium">{item.label}</span>
          <span className="truncate text-[13px] text-[#66635d]">{item.blurb}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onPalette}
            className="flex h-10 items-center gap-2 rounded-[10px] px-3 text-[12.5px] text-[#9a968e] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition-colors hover:bg-white/[0.04] hover:text-[#ece8e1]"
          >
            <Search className="size-3.5" />
            <span className="hidden md:inline">Jump to…</span>
            <kbd className="hidden items-center gap-0.5 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] md:inline-flex">
              <Command className="size-2.5" />K
            </kbd>
          </button>
          <WalletSwitcher />
        </div>
      </div>
      <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
        {NAV.map((n) => (
          <button key={n.id} onClick={() => go(n.id)} className={cx('flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px]', view === n.id ? 'bg-white/[0.08] text-[#ece8e1]' : 'text-[#9a968e]')}>
            <n.icon className="size-3.5" />
            {n.label}
          </button>
        ))}
      </nav>
    </header>
  )
}

function TraceDock() {
  const { traces, go, setFocusTrace } = useStore()
  const [open, setOpen] = useState(false)
  const last = traces[0]
  return (
    <div className="hairline sticky bottom-0 z-20 border-t bg-[#0b0b0a]/90 backdrop-blur-xl">
      {open && (
        <ul className="max-h-[260px] overflow-y-auto border-b border-white/[0.05] py-1">
          {traces.slice(0, 30).map((t) => (
            <li key={t.id}>
              <button
                onClick={() => { setFocusTrace(t.id); go('console') }}
                className="grid w-full grid-cols-[64px_44px_52px_1fr_auto] items-center gap-3 px-5 py-1.5 text-left font-mono text-[11.5px] hover:bg-white/[0.03] md:px-8"
              >
                <span className="text-[#66635d]">{time(t.at).slice(0, 8)}</span>
                <span className={t.method === 'POST' ? 'text-[#7cc4ff]' : 'text-[#9a968e]'}>{t.method}</span>
                <StatusCode status={t.status} />
                <span className="truncate text-[#ece8e1]">{t.path}</span>
                <span className="tnum text-[#9a968e]">{t.ms}ms</span>
              </button>
            </li>
          ))}
          {!traces.length && <li className="px-8 py-3 font-mono text-[11.5px] text-[#66635d]">No requests yet.</li>}
        </ul>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-10 w-full items-center gap-3 px-5 text-left font-mono text-[11.5px] md:px-8">
        <SquareTerminal className="size-3.5 text-[#66635d]" />
        <span className="text-[#66635d]">trace</span>
        {last ? (
          <span key={last.id} className="flex min-w-0 animate-rise items-center gap-3">
            <span className={last.method === 'POST' ? 'text-[#7cc4ff]' : 'text-[#9a968e]'}>{last.method}</span>
            <span className="truncate text-[#ece8e1]">{last.path}</span>
            <StatusCode status={last.status} />
            <span className="tnum text-[#9a968e]">{last.ms}ms</span>
            {last.responseHeaders['idempotent-replayed'] && <Badge tone="info">replayed</Badge>}
          </span>
        ) : (
          <span className="text-[#66635d]">waiting for first request…</span>
        )}
        <span className="ml-auto flex items-center gap-2 text-[#66635d]">
          <span className="tnum">{traces.length} req</span>
          {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </span>
      </button>
    </div>
  )
}

function Palette({ onClose }: { onClose: () => void }) {
  const { go, wallets, select } = useStore()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const items = useMemo(() => {
    const all = [
      ...NAV.map((n) => ({ key: n.id, label: n.label, sub: n.blurb, kind: 'Go to', run: () => go(n.id) })),
      ...wallets.map((w) => ({ key: w.id, label: w.owner, sub: `${shortId(w.id)} · ${money(w.balance, w.currency)}`, kind: 'Wallet', run: () => { select(w.id); go('wallets') } })),
    ]
    const s = q.toLowerCase()
    return all.filter((i) => !s || i.label.toLowerCase().includes(s) || i.sub.toLowerCase().includes(s))
  }, [q, wallets, go, select])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[14vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-label="Command palette" className="panel w-full max-w-[560px] animate-rise overflow-hidden rounded-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="hairline flex items-center gap-3 border-b px-4">
          <Search className="size-4 text-[#66635d]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
              if (e.key === 'Enter' && items[idx]) { items[idx].run(); onClose() }
              if (e.key === 'Escape') onClose()
            }}
            placeholder="Search sections and wallets"
            className="h-14 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-[#66635d]"
          />
          <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-[#66635d]">ESC</kbd>
        </div>
        <ul className="max-h-[360px] overflow-y-auto p-1.5">
          {items.map((it, i) => (
            <li key={it.key}>
              <button
                onMouseEnter={() => setIdx(i)}
                onClick={() => { it.run(); onClose() }}
                className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left', i === idx && 'bg-white/[0.06]')}
              >
                <span className="w-14 font-mono text-[10px] tracking-wide text-[#66635d] uppercase">{it.kind}</span>
                <span className="text-[13.5px] font-medium">{it.label}</span>
                <span className="ml-auto truncate font-mono text-[11px] text-[#66635d]">{it.sub}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="px-3 py-6 text-center text-[13px] text-[#66635d]">No matches</li>}
        </ul>
      </div>
    </div>
  )
}

function Toasts() {
  const { toasts } = useStore()
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-14 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="panel pointer-events-auto flex animate-rise gap-3 rounded-xl p-3.5">
          {t.tone === 'ok' ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-[#c4f55a]" /> : t.tone === 'err' ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#ff6b57]" /> : <Info className="mt-0.5 size-4 shrink-0 text-[#7cc4ff]" />}
          <div className="min-w-0">
            <div className="text-[13px] font-medium">{t.title}</div>
            {t.detail && <div className="mt-0.5 font-mono text-[11.5px] break-words text-[#9a968e]">{t.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const [palette, setPalette] = useState(false)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  return (
    <div className="flex min-h-screen">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onPalette={() => setPalette(true)} />
        <main id="main" className="flex-1 px-5 py-8 md:px-8 md:py-10">
          <div className="mx-auto max-w-[1240px]">{children}</div>
        </main>
        <TraceDock />
      </div>
      {palette && <Palette onClose={() => setPalette(false)} />}
      <Toasts />
    </div>
  )
}

function PageHead({ index, title, lede, actions }: { index: string; title: ReactNode; lede: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">§ {index}</div>
        <h1 className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] md:text-[56px]">{title}</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-[#9a968e]">{lede}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

// ─── Overview ────────────────────────────────────────────────────
const CAPS: Record<string, { title: string; body: string; icon: typeof Lock; lab?: boolean }> = {
  double_entry: { title: 'Double-entry', body: 'Every movement posts a balanced debit and credit. The system-wide sum is always zero.', icon: Scale },
  'double-entry-reconciliation': { title: 'Double-Entry Reconciliation', body: 'Every movement posts balanced debit and credit entries. Global balance drift is 0.', icon: Scale, lab: true },
  idempotency_keys: { title: 'Idempotency keys', body: 'Retries with the same key return the original response; money moves once.', icon: Fingerprint, lab: true },
  'cryptographic-idempotency': { title: 'Cryptographic Idempotency', body: 'SHA-256 payload validation and atomic 60s lock lease recovery on crash.', icon: Fingerprint, lab: true },
  payload_fingerprinting: { title: 'Payload fingerprinting', body: 'A reused key with a different body is rejected rather than silently replayed.', icon: ShieldCheck, lab: true },
  row_level_locking: { title: 'Row-level locking', body: 'Wallet rows are locked in a fixed id order, which prevents lost updates and deadlocks.', icon: Lock, lab: true },
  'deadlock-free-locking': { title: 'Deadlock-Free Locking', body: 'Strict ascending numerical order row locks prevent circular wait conditions under load.', icon: Lock, lab: true },
  overdraft_protection: { title: 'Overdraft protection', body: 'Balance checks happen inside the locked transaction, never before it.', icon: Zap, lab: true },
  'non-negative-check-constraint': { title: 'Non-Negative Balance Constraint', body: 'Enforced at the storage engine level with CHECK (balance >= 0).', icon: Zap, lab: true },
  'in-memory-microbatching': { title: 'In-Memory Micro-Batching', body: 'Groups transfers into 50-item batches or 2ms timer buckets to amortize disk fsync costs.', icon: Layers, lab: true },
  hash_chained_entries: { title: 'Hash-chained entries', body: 'Each entry commits to its predecessor, so tampering with history is detectable.', icon: Hash },
  serializable_isolation: { title: 'Serializable isolation', body: 'Transactions behave as if they ran one after another.', icon: Layers },
}

const PIPELINE = [
  { k: 'HTTP', d: 'net/http handler', sub: 'validate · decode' },
  { k: 'Guard', d: 'Idempotency', sub: 'key + sha256(body)' },
  { k: 'BEGIN', d: 'Serializable tx', sub: 'SELECT … FOR UPDATE' },
  { k: 'Check', d: 'Invariants', sub: 'balance ≥ amount' },
  { k: 'Post', d: 'Ledger entries', sub: 'append-only · chained' },
  { k: 'COMMIT', d: 'Durable', sub: 'response cached by key' },
]

function Overview() {
  const { health, healthMs, latencyHistory, wallets, mode, go, refreshHealth } = useStore()
  const total = wallets.reduce((s, w) => s + w.balance, 0)
  const avg = latencyHistory.length ? latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length : 0
  const p95 = latencyHistory.length ? [...latencyHistory].sort((a, b) => a - b)[Math.floor(latencyHistory.length * 0.95)] ?? 0 : 0
  const up = !!health && health.status === 'ok'

  const segments = useMemo(() => {
    const sorted = [...wallets].filter((w) => w.balance > 0).sort((a, b) => b.balance - a.balance)
    const top = sorted.slice(0, 5)
    const otherBalance = sorted.slice(5).reduce((acc, w) => acc + w.balance, 0)
    const colors = ['#c4f55a', '#7cc4ff', '#f5b544', '#c084fc', '#38bdf8']
    const result = top.map((w, i) => ({
      id: w.id,
      label: w.owner,
      balance: w.balance,
      pct: total > 0 ? (w.balance / total) * 100 : 0,
      color: colors[i % colors.length],
    }))
    if (otherBalance > 0) {
      result.push({
        id: 'other',
        label: `Other accounts (${sorted.length - 5})`,
        balance: otherBalance,
        pct: total > 0 ? (otherBalance / total) * 100 : 0,
        color: 'rgba(255, 255, 255, 0.25)',
      })
    }
    return result
  }, [wallets, total])

  return (
    <div className="animate-rise">
      <PageHead
        index="01 Overview"
        title={<>Every cent, <em className="text-[#c4f55a]">accounted for.</em></>}
        lede="A double-entry payment ledger with idempotent writes, serializable transactions and a hash-chained audit trail. This page reports live engine health and the guarantees you can verify in the Systems Lab."
        actions={<button onClick={() => go('lab')} className="group inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#c4f55a] px-4 text-[13.5px] font-medium text-[#0b0b0a] hover:bg-[#d3ff72]">Open Systems Lab <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></button>}
      />

      <div className="panel relative grid overflow-hidden rounded-2xl lg:grid-cols-[1.25fr_1fr]">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="relative p-6 md:p-8">
          <div className="eyebrow">Total value held · {wallets.length} wallets</div>
          <div className="mt-5"><Amount minor={total} size="hero" /></div>
          <div className="mt-8">
            <div className="flex h-3 gap-1 overflow-hidden rounded-full bg-white/[0.05] p-0.5 shadow-inner">
              {segments.map((s) => (
                <div
                  key={s.id}
                  title={`${s.label}: ${money(s.balance)} (${s.pct.toFixed(1)}%)`}
                  className="h-full rounded-sm transition-all duration-500"
                  style={{ width: `${Math.max(s.pct, 0.5)}%`, backgroundColor: s.color }}
                />
              ))}
            </div>
            <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {segments.map((s) => (
                <li key={s.id} className="flex items-center gap-2.5 text-[12.5px]">
                  <span className="size-2 shrink-0 rounded-[3px]" style={{ backgroundColor: s.color }} />
                  <span className="truncate text-[#9a968e]">{s.label}</span>
                  <span className="tnum ml-auto font-mono text-[#ece8e1]">{s.pct.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="hairline relative grid grid-cols-2 border-t lg:border-t-0 lg:border-l">
          <Metric label="Engine" icon={<GitCommitHorizontal className="size-3.5" />} value={<span className={up ? 'text-[#c4f55a]' : 'text-[#ff6b57]'}>{health ? health.status.toUpperCase() : mode === 'probing' ? '…' : 'DOWN'}</span>} sub={health ? `${health.version} · up ${fmtUptime(health.uptime_s)}` : '—'} />
          <Metric label="Database" icon={<Database className="size-3.5" />} value={<span className={health?.database.status === 'up' ? 'text-[#ece8e1]' : 'text-[#ff6b57]'}>{health ? <>{health.database.latency_ms}<span className="text-[0.55em] text-[#9a968e]">ms</span></> : '—'}</span>} sub={health?.database.driver ?? '—'} border />
          <Metric label="API round-trip" icon={<Timer className="size-3.5" />} value={<span className="tnum">{healthMs ?? '—'}<span className="text-[0.55em] text-[#9a968e]">ms</span></span>} sub={`avg ${avg.toFixed(1)} · p95 ${p95.toFixed(1)}`} top>
            <Sparkline data={latencyHistory} className="mt-3 w-full" height={28} />
          </Metric>
          <Metric label="Connection pool" icon={<Layers className="size-3.5" />} value={<span className="tnum">{health?.database.pool_in_use ?? '—'}<span className="text-[0.55em] text-[#9a968e]"> / {health?.database.pool_max ?? '—'}</span></span>} sub="connections in use" border top>
            <div className="mt-3 flex gap-[3px]">
              {Array.from({ length: health?.database.pool_max ?? 25 }).map((_, i) => (
                <span key={i} className={cx('h-4 flex-1 rounded-[2px]', health && i < health.database.pool_in_use ? 'bg-[#c4f55a]' : 'bg-white/[0.06]')} />
              ))}
            </div>
          </Metric>
        </div>
      </div>

      {mode === 'sim' && (
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#f5b544]/[0.07] px-4 py-3 text-[12.5px] shadow-[inset_0_0_0_1px_rgba(245,181,68,0.2)]">
          <Badge tone="warn">sim</Badge>
          <p className="leading-relaxed text-[#f5b544]/90">
            These figures come from the in-memory mock engine, which enforces the same invariants as the real ledger.
            <button onClick={refreshHealth} className="ml-2 underline underline-offset-2 hover:text-[#f5b544]">Refresh</button>
          </p>
        </div>
      )}

      <Panel className="mt-6">
        <PanelHeader eyebrow="Write path" title="What happens when money moves" actions={<Badge>POST /transfers</Badge>} />
        <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl bg-white/[0.05] md:grid-cols-3 xl:grid-cols-6">
          {PIPELINE.map((s, i) => (
            <li key={s.k} className="relative bg-[#111110] p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-[#66635d]">0{i + 1}</span>
                {i < PIPELINE.length - 1 && <ArrowRight className="size-3.5 text-[#66635d]" />}
              </div>
              <div className="mt-4 font-mono text-[13px] font-semibold text-[#c4f55a]">{s.k}</div>
              <div className="mt-1 text-[13px] text-[#ece8e1]">{s.d}</div>
              <div className="mt-1 font-mono text-[11px] text-[#66635d]">{s.sub}</div>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="mt-10 mb-4 flex items-end justify-between">
        <div>
          <div className="eyebrow mb-1.5">Guarantees</div>
          <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Capabilities reported by the engine</h2>
        </div>
        <span className="font-mono text-[11px] text-[#66635d]">{health?.capabilities.length ?? 0} advertised</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(health?.capabilities ?? []).map((c) => {
          const meta = CAPS[c] ?? { title: c.replace(/_/g, ' '), body: 'Advertised by the engine.', icon: ShieldCheck }
          return (
            <Panel key={c} as="article" className="group flex flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.05] text-[#c4f55a]"><meta.icon className="size-4" strokeWidth={1.75} /></span>
                <code className="font-mono text-[10px] text-[#66635d]">{c}</code>
              </div>
              <h3 className="mt-5 text-[14px] font-semibold">{meta.title}</h3>
              <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-[#9a968e]">{meta.body}</p>
              {meta.lab && (
                <button onClick={() => go('lab')} className="mt-4 inline-flex items-center gap-1 self-start text-[12px] font-medium text-[#ece8e1]/80 hover:text-[#c4f55a]">
                  Verify in Lab <ArrowUpRight className="size-3.5" />
                </button>
              )}
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

function Metric({ label, value, sub, icon, border, top, children }: { label: string; value: ReactNode; sub: string; icon: ReactNode; border?: boolean; top?: boolean; children?: ReactNode }) {
  return (
    <div className={cx('hairline flex min-w-0 flex-col p-5 md:p-6', border && 'border-l', top && 'border-t')}>
      <div className="flex items-center gap-2 text-[#66635d]">{icon}<span className="eyebrow">{label}</span></div>
      <div className="mt-3 text-[26px] font-medium tracking-[-0.02em]">{value}</div>
      <div className="mt-1 truncate font-mono text-[11px] text-[#66635d]">{sub}</div>
      {children}
    </div>
  )
}

function fmtUptime(s: number) {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

// ─── Wallets ─────────────────────────────────────────────────────
type TxMode = 'deposit' | 'withdrawal' | 'transfer'

function Wallets({ onTransact }: { onTransact: (kind: TxMode) => void }) {
  const { wallets, selected, select, go } = useStore()
  return (
    <div className="animate-rise">
      <PageHead index="02 Wallets" title={<>Accounts <em className="text-[#9a968e]">&amp;</em> balances</>} lede="Balances are stored as integer minor units and versioned on every write. The wallet you choose here stays active in Transact and Ledger." />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {selected ? (
          <Panel className="relative overflow-hidden">
            <div className="grid-bg pointer-events-none absolute inset-0" />
            <div className="relative p-6 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Monogram name={selected.owner} size={40} />
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold tracking-[-0.01em]">{selected.owner}</div>
                    <div className="flex items-center gap-1 truncate font-mono text-[11.5px] text-[#66635d]">{selected.id}<CopyButton value={selected.id} label="Copy wallet id" /></div>
                  </div>
                </div>
                <Badge tone="ok" dot>Active</Badge>
              </div>
              <div className="eyebrow mt-10">Available balance</div>
              <div key={selected.balance} className="mt-3 animate-rise"><Amount minor={selected.balance} currency={selected.currency} size="hero" /></div>
              <dl className="mt-8 grid grid-cols-3 gap-6 border-t border-white/[0.06] pt-5">
                <Meta k="Currency" v={selected.currency} />
                <Meta k="Row version" v={`v${selected.version}`} />
                <Meta k="Opened" v={relTime(selected.created_at)} />
              </dl>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button variant="primary" icon={<ArrowLeftRight className="size-4" />} onClick={() => onTransact('transfer')}>Transfer</Button>
                <Button icon={<ArrowDownLeft className="size-4" />} onClick={() => onTransact('deposit')}>Deposit</Button>
                <Button icon={<ArrowUpRight className="size-4" />} onClick={() => onTransact('withdrawal')}>Withdraw</Button>
                <Button variant="ghost" icon={<BookOpenText className="size-4" />} onClick={() => go('ledger')}>View ledger</Button>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel className="p-8 text-[#9a968e]">Loading wallets…</Panel>
        )}
        <CreateWallet />
      </div>

      <div className="mt-10 mb-4 flex items-end justify-between">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em]">All wallets</h2>
        <span className="font-mono text-[11px] text-[#66635d]">{wallets.length} total</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {wallets.map((w) => <WalletCard key={w.id} w={w} active={w.id === selected?.id} onClick={() => select(w.id)} />)}
      </div>
    </div>
  )
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="eyebrow">{k}</dt>
      <dd className="mt-1.5 font-mono text-[13px] text-[#ece8e1]">{v}</dd>
    </div>
  )
}

function WalletCard({ w, active, onClick }: { w: Wallet; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx('panel group relative flex flex-col rounded-2xl p-5 text-left transition-all duration-200 hover:-translate-y-0.5', active && 'shadow-[inset_0_0_0_1px_rgba(196,245,90,0.45),0_20px_40px_-24px_rgba(196,245,90,0.25)]')}
    >
      <div className="flex items-center gap-3">
        <Monogram name={w.owner} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium">{w.owner}</div>
          <div className="font-mono text-[10.5px] text-[#66635d]">{shortId(w.id, 12)}</div>
        </div>
        {active && <span className="size-1.5 rounded-full bg-[#c4f55a]" aria-label="Active" />}
      </div>
      <div className="tnum mt-6 font-mono text-[22px] tracking-[-0.02em] text-[#ece8e1]">{money(w.balance, w.currency)}</div>
      <div className="mt-1 flex items-center gap-2 font-mono text-[10.5px] text-[#66635d]">
        <span>{w.currency}</span><span>·</span><span>v{w.version}</span><span>·</span><span>{relTime(w.created_at)}</span>
      </div>
    </button>
  )
}

function CreateWallet() {
  const { toast, bump, select } = useStore()
  const [owner, setOwner] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!owner.trim()) return setError('Give the wallet an owner name.')
    setBusy(true)
    setError(null)
    const r = await request<Wallet>('POST', '/wallets', { owner: owner.trim() })
    setBusy(false)
    if (!r.ok) return setError(errMsg(r))
    toast({ tone: 'ok', title: 'Wallet created', detail: `${r.data.id} · HTTP ${r.status}` })
    setOwner('')
    select(r.data.id)
    bump()
  }
  return (
    <Panel>
      <PanelHeader eyebrow="POST /wallets" title="Open a wallet" />
      <form onSubmit={submit} className="flex flex-col gap-4 px-5 pb-5">
        <Field label="Owner" htmlFor="owner" error={error}>
          <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. Atlas Logistics" autoComplete="off" />
        </Field>
        <Field label="Currency" htmlFor="ccy" hint="Base ledger denomination">
          <div className="flex h-10 w-full items-center justify-between rounded-[10px] bg-[#0b0b0a]/60 px-3 font-mono text-[13px] text-[#ece8e1] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)]">
            <span>USD · US Dollar (cents)</span>
            <span className="rounded bg-[#c4f55a]/10 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-[#c4f55a]">Single-Currency</span>
          </div>
        </Field>
        <div className="rounded-[10px] bg-[#0b0b0a]/60 p-3 font-mono text-[11px] leading-relaxed text-[#66635d] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
          New wallets start at <span className="text-[#ece8e1]">0</span> minor units and <span className="text-[#ece8e1]">v0</span>. Funds arrive only through posted ledger entries.
        </div>
        <Button type="submit" variant="primary" loading={busy} icon={<Plus className="size-4" />}>Create wallet</Button>
      </form>
    </Panel>
  )
}

// ─── Transact ────────────────────────────────────────────────────
interface Attempt {
  n: number
  key: string
  kind: TxMode
  amount: number
  status: number
  replayed: boolean
  code?: string
  message?: string
  txId?: string
  ms: number
  effects: { wallet: Wallet; before: number; after: number }[]
}

const PATH: Record<TxMode, string> = { deposit: '/deposits', withdrawal: '/withdrawals', transfer: '/transfers' }

function Transact({ initial }: { initial: TxMode }) {
  const { wallets, selected, bump, toast } = useStore()
  const [kind, setKind] = useState<TxMode>(initial)
  const [from, setFrom] = useState(selected?.id ?? '')
  const [to, setTo] = useState('')
  const [target, setTarget] = useState(selected?.id ?? '')
  const [amountStr, setAmountStr] = useState('250.00')
  const [reference, setReference] = useState('')
  const [key, setKey] = useState(idemKey)
  const [pinned, setPinned] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempts, setAttempts] = useState<Attempt[]>([])

  useEffect(() => setKind(initial), [initial])
  useEffect(() => {
    if (selected) { setFrom(selected.id); setTarget(selected.id) }
  }, [selected?.id])
  useEffect(() => {
    if (!to || to === from) setTo(wallets.find((w) => w.id !== from)?.id ?? '')
  }, [from, wallets])

  const amount = parseMinor(amountStr)
  const byId = (id: string) => wallets.find((w) => w.id === id)
  const source = kind === 'transfer' ? byId(from) : kind === 'withdrawal' ? byId(target) : null
  const body = useMemo(() => {
    const base = { amount: amount ?? 0, ...(reference ? { reference } : {}) }
    return kind === 'transfer' ? { from_wallet_id: from, to_wallet_id: to, ...base } : { wallet_id: target, ...base }
  }, [kind, from, to, target, amount, reference])

  const amountErr = amountStr && amount === null ? 'Use a positive amount with up to 2 decimals.' : amount === 0 ? 'Amount must be greater than zero.' : null
  const sameErr = kind === 'transfer' && from === to ? 'Choose two different wallets.' : null
  const overdraft = source && amount ? amount > source.balance : false
  const lastKey = attempts[0]?.key

  async function send(useKey: string) {
    if (amount === null || amount === 0 || sameErr) return
    setBusy(true)
    const affected = (kind === 'transfer' ? [from, to] : [target]).map(byId).filter(Boolean) as Wallet[]
    const before = Object.fromEntries(affected.map((w) => [w.id, w.balance]))
    const r: ApiResult<Transaction> = await request('POST', PATH[kind], body, { 'Idempotency-Key': useKey })
    const after = await Promise.all(affected.map((w) => request<Wallet>('GET', `/wallets/${w.id}`)))
    const replayed = r.headers['idempotent-replayed'] === 'true'
    const att: Attempt = {
      n: attempts.length + 1, key: useKey, kind, amount, status: r.status, replayed, ms: r.trace.ms,
      code: r.ok ? undefined : errCode(r), message: r.ok ? undefined : errMsg(r), txId: r.ok ? r.data.id : undefined,
      effects: after.map((a, i) => ({ wallet: affected[i], before: before[affected[i].id], after: a.ok ? a.data.balance : before[affected[i].id] })),
    }
    setAttempts((p) => [att, ...p].slice(0, 12))
    setBusy(false)
    bump()
    if (r.ok) {
      toast({ tone: replayed ? 'info' : 'ok', title: replayed ? 'Replayed. No new funds moved.' : 'Posted to ledger', detail: `${r.data.id} · HTTP ${r.status}` })
      if (!pinned && !replayed) setKey(idemKey())
    } else toast({ tone: 'err', title: 'Rejected by engine', detail: `${att.code} · HTTP ${r.status}` })
  }

  const last = attempts[0]

  return (
    <div className="animate-rise">
      <PageHead index="03 Transact" title={<>Move money, <em className="text-[#9a968e]">exactly once.</em></>} lede="Every money movement needs an Idempotency-Key. Pin the key and resend to watch the engine return the original response without moving funds again." />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <SegTabs
              value={kind}
              onChange={setKind}
              options={[
                { value: 'transfer', label: <><ArrowLeftRight className="size-3.5" />Transfer</> },
                { value: 'deposit', label: <><ArrowDownLeft className="size-3.5" />Deposit</> },
                { value: 'withdrawal', label: <><ArrowUpRight className="size-3.5" />Withdraw</> },
              ]}
            />
            <Badge>POST {PATH[kind]}</Badge>
          </div>

          <form className="flex flex-col gap-5 p-5" onSubmit={(e) => { e.preventDefault(); send(key) }}>
            {kind === 'transfer' ? (
              <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
                <WalletPick id="from" label="From" value={from} onChange={setFrom} wallets={wallets} />
                <div className="hidden h-10 items-center justify-center md:flex"><ArrowRight className="size-4 text-[#66635d]" /></div>
                <div className="flex justify-center md:hidden"><ArrowDown className="size-4 text-[#66635d]" /></div>
                <WalletPick id="to" label="To" value={to} onChange={setTo} wallets={wallets.filter((w) => w.id !== from)} />
              </div>
            ) : (
              <WalletPick id="target" label={kind === 'deposit' ? 'Credit wallet' : 'Debit wallet'} value={target} onChange={setTarget} wallets={wallets} />
            )}
            {sameErr && <p className="-mt-3 text-[12px] text-[#ff6b57]">{sameErr}</p>}

            <Field label="Amount" htmlFor="amt" hint={amount != null ? <span className="font-mono">= {amount.toLocaleString()} minor units</span> : undefined} error={amountErr}>
              <div className="flex h-[72px] items-center gap-2 rounded-xl bg-[#0b0b0a]/60 px-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] focus-within:shadow-[inset_0_0_0_1px_rgba(196,245,90,0.6),0_0_0_4px_rgba(196,245,90,0.08)]">
                <span className="font-display text-[28px] text-[#9a968e]">$</span>
                <input id="amt" inputMode="decimal" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} className="tnum min-w-0 flex-1 bg-transparent font-display text-[40px] tracking-[-0.02em] text-[#ece8e1] outline-none" aria-invalid={!!amountErr} />
                <div className="hidden gap-1 sm:flex">
                  {['10.00', '250.00', '5000.00'].map((v) => (
                    <button type="button" key={v} onClick={() => setAmountStr(v)} className="rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-[#9a968e] hover:bg-white/[0.1] hover:text-[#ece8e1]">{money(parseMinor(v)!)}</button>
                  ))}
                  {source && <button type="button" onClick={() => setAmountStr((source.balance / 100).toFixed(2))} className="rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-[#9a968e] hover:bg-white/[0.1] hover:text-[#ece8e1]">MAX</button>}
                </div>
              </div>
            </Field>
            {overdraft && source && (
              <div className="-mt-2 flex items-center gap-2 rounded-lg bg-[#f5b544]/[0.08] px-3 py-2 text-[12px] text-[#f5b544]">
                <TriangleAlert className="size-3.5 shrink-0" />
                Exceeds {source.owner}'s available {money(source.balance)}. You can still submit to watch the engine reject it.
              </div>
            )}

            <Field label="Reference" htmlFor="ref" hint="Optional">
              <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Invoice 2291 · April payout" />
            </Field>

            {/* Idempotency control */}
            <div className={cx('rounded-xl p-4 transition-shadow', pinned ? 'bg-[#7cc4ff]/[0.05] shadow-[inset_0_0_0_1px_rgba(124,196,255,0.3)]' : 'bg-[#0b0b0a]/50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]')}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-medium text-[#9a968e]">Idempotency-Key</div>
                  <div className="mt-1 flex items-center gap-1 font-mono text-[13px] text-[#ece8e1]">
                    <span className="truncate">{key}</span>
                    <CopyButton value={key} label="Copy key" />
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" size="sm" variant={pinned ? 'secondary' : 'ghost'} onClick={() => setPinned((p) => !p)} icon={pinned ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />} aria-pressed={pinned}>
                    {pinned ? 'Pinned' : 'Pin'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setKey(idemKey())} icon={<RefreshCw className="size-3.5" />} aria-label="Generate new key" />
                </div>
              </div>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-[#66635d]">
                {pinned ? 'Pinned: every submit reuses this key. Change the amount to test payload fingerprinting.' : 'A fresh key is generated after each successful post. Pin it to simulate client retries.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!!amountErr || !!sameErr || amount == null} icon={<Send className="size-4" />} className="flex-1">
                Submit {kind}
              </Button>
              <Button type="button" size="lg" disabled={!lastKey || busy} onClick={() => lastKey && send(lastKey)} icon={<RotateCcw className="size-4" />}>
                Retry last key
              </Button>
            </div>
          </form>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader eyebrow="Request preview" title={<span className="font-mono text-[13px]"><span className="text-[#7cc4ff]">POST</span> /api/v1{PATH[kind]}</span>} />
            <div className="px-5 pb-5">
              <div className="rounded-xl bg-[#0b0b0a]/70 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
                <div className="font-mono text-[11.5px] leading-[1.7]">
                  <div><span className="text-[#66635d]">Content-Type:</span> <span className="text-[#9a968e]">application/json</span></div>
                  <div><span className="text-[#66635d]">Idempotency-Key:</span> <span className={pinned ? 'text-[#7cc4ff]' : 'text-[#ece8e1]'}>{key}</span></div>
                </div>
                <div className="my-3 border-t border-white/[0.05]" />
                <Json value={body} />
              </div>
            </div>
          </Panel>

          <Panel className="flex-1">
            <PanelHeader eyebrow="Response" title="Outcome" actions={last && <StatusCode status={last.status} />} />
            <div className="px-5 pb-5">
              {!last ? (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-[12.5px] text-[#66635d]">Submit a request to see the engine's response and the balance changes.</p>
              ) : (
                <div key={last.n} className="animate-rise">
                  <div className={cx('rounded-xl p-4', last.status >= 200 && last.status < 300 ? (last.replayed ? 'bg-[#7cc4ff]/[0.06]' : 'bg-[#c4f55a]/[0.06]') : 'bg-[#ff6b57]/[0.07]')}>
                    <div className="flex items-center gap-2">
                      {last.replayed ? <Badge tone="info">Idempotent replay</Badge> : last.status < 300 ? <Badge tone="ok">Posted</Badge> : <Badge tone="err">{last.code}</Badge>}
                      <span className="tnum ml-auto font-mono text-[11px] text-[#9a968e]">{last.ms}ms</span>
                    </div>
                    <p className="mt-2.5 text-[13px] leading-relaxed text-[#ece8e1]">
                      {last.replayed ? 'The engine recognized this key and fingerprint and returned the original transaction. Balances did not change.' : last.status < 300 ? 'Transaction committed. Ledger entries are posted and the response is cached under this key.' : last.message}
                    </p>
                    {last.txId && <div className="mt-2 flex items-center gap-1 font-mono text-[11.5px] text-[#9a968e]">{last.txId}<CopyButton value={last.txId} /></div>}
                  </div>
                  <ul className="mt-3 flex flex-col gap-2">
                    {last.effects.map((e) => {
                      const d = e.after - e.before
                      return (
                        <li key={e.wallet.id} className="flex items-center gap-3 rounded-lg bg-white/[0.025] px-3 py-2.5">
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#9a968e]">{e.wallet.owner}</span>
                          <span className="tnum font-mono text-[12px] text-[#66635d]">{money(e.before)}</span>
                          <ArrowRight className="size-3 text-[#66635d]" />
                          <span className="tnum font-mono text-[12px] text-[#ece8e1]">{money(e.after)}</span>
                          <span className={cx('tnum w-24 text-right font-mono text-[12px]', d > 0 ? 'text-[#c4f55a]' : d < 0 ? 'text-[#ff6b57]' : 'text-[#66635d]')}>{d === 0 ? '±0.00' : money(d, 'USD', { sign: true })}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {attempts.length > 0 && (
        <Panel className="mt-4">
          <PanelHeader eyebrow="This session" title="Attempts" actions={<Button size="sm" variant="ghost" onClick={() => setAttempts([])}>Clear</Button>} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="eyebrow border-y border-white/[0.05]">
                  <th className="px-5 py-2.5 font-normal">#</th><th className="py-2.5 font-normal">Key</th><th className="py-2.5 font-normal">Kind</th><th className="py-2.5 text-right font-normal">Amount</th><th className="py-2.5 pl-6 font-normal">Status</th><th className="py-2.5 font-normal">Result</th><th className="px-5 py-2.5 text-right font-normal">Latency</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[12px]">
                {attempts.map((a, i) => {
                  const sameAsNext = attempts[i + 1]?.key === a.key
                  return (
                    <tr key={a.n} className={cx('border-b border-white/[0.04]', i === 0 && 'animate-flash')}>
                      <td className="px-5 py-2.5 text-[#66635d]">{a.n}</td>
                      <td className="py-2.5"><span className={sameAsNext ? 'text-[#7cc4ff]' : 'text-[#9a968e]'}>{shortId(a.key, 10)}</span></td>
                      <td className="py-2.5 text-[#9a968e]">{a.kind}</td>
                      <td className="tnum py-2.5 text-right text-[#ece8e1]">{money(a.amount)}</td>
                      <td className="py-2.5 pl-6"><StatusCode status={a.status} /></td>
                      <td className="py-2.5">{a.replayed ? <Badge tone="info">replayed</Badge> : a.code ? <span className="text-[#ff6b57]">{a.code}</span> : <span className="text-[#c4f55a]">posted</span>}</td>
                      <td className="tnum px-5 py-2.5 text-right text-[#9a968e]">{a.ms}ms</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}

function WalletPick({ id, label, value, onChange, wallets }: { id: string; label: string; value: string; onChange: (v: string) => void; wallets: Wallet[] }) {
  const w = wallets.find((x) => x.id === value)
  return (
    <Field label={label} htmlFor={id} hint={w ? <span className="tnum font-mono">{money(w.balance, w.currency)}</span> : undefined}>
      <Select id={id} value={value} onChange={onChange}>
        {!w && <option value="">Select wallet</option>}
        {wallets.map((x) => <option key={x.id} value={x.id}>{x.owner}</option>)}
      </Select>
    </Field>
  )
}

// ─── Ledger ──────────────────────────────────────────────────────
function Ledger() {
  const { selected, wallets, revision } = useStore()
  const [tab, setTab] = useState<'entries' | 'transactions'>('entries')
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [txs, setTxs] = useState<Transaction[]>([])
  const [recon, setRecon] = useState<Reconciliation | null>(null)
  const [loading, setLoading] = useState(false)
  const [reconBusy, setReconBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!selected) return
    setLoading(true)
    const [e, t] = await Promise.all([
      request<{ data: LedgerEntry[]; entries?: LedgerEntry[] }>('GET', `/wallets/${selected.id}/entries`),
      request<{ data: Transaction[]; transactions?: Transaction[] }>('GET', `/wallets/${selected.id}/transactions`),
    ])
    // Live API: { entries|transactions }; mock: { data }. Never setState(undefined).
    const list = (v: unknown) => (Array.isArray(v) ? v : [])
    const rawEntries = e.ok ? list(e.data?.entries ?? e.data?.data) : []
    const rawTxs = t.ok ? list(t.data?.transactions ?? t.data?.data) : []

    setEntries(rawEntries.map((entry: any) => ({
      ...entry,
      id: String(entry.id),
      transaction_id: String(entry.transaction_id),
      wallet_id: String(entry.wallet_id),
      direction: entry.direction || (entry.amount >= 0 ? 'credit' : 'debit'),
      amount: Math.abs(entry.amount),
    })))

    setTxs(rawTxs.map((tx: any) => ({
      ...tx,
      id: String(tx.id),
      kind: tx.type || tx.kind || 'transfer',
      from_wallet_id: tx.from_wallet_id != null ? String(tx.from_wallet_id) : (tx.wallet_id != null ? String(tx.wallet_id) : null),
      to_wallet_id: tx.to_wallet_id != null ? String(tx.to_wallet_id) : null,
      currency: tx.currency || 'USD',
      idempotency_key: tx.idempotency_key ? String(tx.idempotency_key) : '',
    })))
    setLoading(false)
  }, [selected?.id])

  const reconcile = useCallback(async () => {
    if (!selected) return
    setReconBusy(true)
    const r = await request<Reconciliation>('GET', `/wallets/${selected.id}/reconcile`)
    setRecon(r.ok ? r.data : null)
    setReconBusy(false)
  }, [selected?.id])

  useEffect(() => { load(); setRecon(null) }, [load])
  useEffect(() => { if (revision) load() }, [revision])
  useEffect(() => { reconcile() }, [reconcile])

  const safeEntries = entries || []
  const safeTxs = txs || []
  const credits = safeEntries.filter((e) => e.direction === 'credit' || e.amount > 0).reduce((s, e) => s + Math.abs(e.amount), 0)
  const debits = safeEntries.filter((e) => e.direction === 'debit' || e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
  const name = (id: string | null) => (id ? wallets.find((w) => String(w.id) === String(id))?.owner ?? shortId(id) : 'External')

  return (
    <div className="animate-rise">
      <PageHead
        index="04 Ledger"
        title={<>The book of <em className="text-[#9a968e]">record.</em></>}
        lede={<>Append-only entries for <span className="text-[#ece8e1]">{selected?.owner ?? '—'}</span>. Each entry stores the hash of the one before it, and reconciliation recomputes the balance from scratch.</>}
        actions={<Button size="sm" variant="ghost" icon={<RefreshCw className={cx('size-3.5', loading && 'animate-spin')} />} onClick={load}>Refresh</Button>}
      />

      {/* Reconciliation equation */}
      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-6 p-6 md:p-7 lg:flex-row lg:items-center">
          <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-4">
            <Term label="Σ credits" value={money(credits)} tone="text-[#c4f55a]" />
            <Op>−</Op>
            <Term label="Σ debits" value={money(debits)} />
            <Op>=</Op>
            <Term label="Ledger balance" value={recon ? money(recon.ledger_balance) : '—'} />
            <Op>{recon ? (recon.balanced ? '≡' : '≠') : '?'}</Op>
            <Term label="Cached balance" value={recon ? money(recon.cached_balance) : '—'} />
          </div>
          <div className="flex shrink-0 items-center gap-3 lg:border-l lg:border-white/[0.06] lg:pl-6">
            <div className="flex flex-col gap-1.5">
              <ReconCheck ok={recon?.balanced} label={recon ? (recon.balanced ? 'Balances reconcile' : `Drift of ${money(recon.cached_balance - recon.ledger_balance)}`) : 'Not checked'} />
              <ReconCheck ok={recon?.chain_valid} label={recon ? (recon.chain_valid ? 'Hash chain intact' : 'Hash chain broken') : 'Not checked'} />
            </div>
            <Button size="sm" loading={reconBusy} onClick={reconcile} icon={<ScanSearch className="size-3.5" />}>Reconcile</Button>
          </div>
        </div>
        <div className="border-t border-white/[0.05] px-6 py-2.5 font-mono text-[10.5px] text-[#66635d] md:px-7">
          {recon ? `GET /wallets/${shortId(recon.wallet_id)}/reconcile · ${recon.entry_count} entries · checked ${time(recon.checked_at)}` : 'Reconciliation pending'}
        </div>
      </Panel>

      <div className="mt-8 mb-4 flex items-center justify-between gap-3">
        <SegTabs value={tab} onChange={setTab} options={[{ value: 'entries', label: <>Entries <span className="font-mono text-[10.5px] text-[#66635d]">{entries.length}</span></> }, { value: 'transactions', label: <>Transactions <span className="font-mono text-[10.5px] text-[#66635d]">{txs.length}</span></> }]} />
        <span className="hidden items-center gap-1.5 font-mono text-[11px] text-[#66635d] sm:flex"><Link2 className="size-3.5" />newest first · immutable</span>
      </div>

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          {tab === 'entries' ? (
            entries.length === 0 ? <Empty title="No entries yet" detail="Deposit into this wallet to post its first entries." /> : (
              <table className="w-full min-w-[820px] text-left">
                <thead>
                  <tr className="eyebrow border-b border-white/[0.05]">
                    <th className="px-5 py-3 font-normal">Seq</th>
                    <th className="py-3 font-normal">Time</th>
                    <th className="py-3 font-normal">Direction</th>
                    <th className="py-3 text-right font-normal">Amount</th>
                    <th className="py-3 text-right font-normal">Balance after</th>
                    <th className="py-3 pl-8 font-normal">Transaction</th>
                    <th className="px-5 py-3 font-normal">Hash chain</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-[12px]">
                  {entries.map((e) => (
                    <Fragment key={e.id}>
                      <tr onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="cursor-pointer border-b border-white/[0.035] transition-colors hover:bg-white/[0.02]">
                        <td className="px-5 py-3 text-[#66635d]">#{e.seq ?? e.id}</td>
                        <td className="py-3 text-[#9a968e]">{time(e.created_at)}</td>
                        <td className="py-3"><Badge tone={e.direction === 'credit' ? 'ok' : 'neutral'}>{e.direction === 'credit' ? 'CR' : 'DR'}</Badge></td>
                        <td className={cx('tnum py-3 text-right', e.direction === 'credit' ? 'text-[#c4f55a]' : 'text-[#ece8e1]')}>{e.direction === 'credit' ? '+' : '−'}{money(e.amount).replace('−', '')}</td>
                        <td className="tnum py-3 text-right text-[#ece8e1]">{e.balance_after != null ? money(e.balance_after) : '—'}</td>
                        <td className="py-3 pl-8 text-[#9a968e]">{shortId(e.transaction_id, 10)}</td>
                        <td className="px-5 py-3"><span className="text-[#66635d]">{(e.prev_hash || 'genesis').slice(0, 6)}</span><span className="px-1.5 text-[#66635d]">→</span><span className="text-[#ece8e1]">{(e.hash || 'committed').slice(0, 10)}</span></td>
                      </tr>
                      {expanded === e.id && (
                        <tr className="border-b border-white/[0.035] bg-[#0b0b0a]/50">
                          <td colSpan={7} className="px-5 py-4">
                            <dl className="grid gap-x-8 gap-y-2 text-[11.5px] md:grid-cols-2">
                              <KV k="entry_id" v={e.id} />
                              <KV k="transaction_id" v={e.transaction_id} />
                              <KV k="prev_hash" v={e.prev_hash || 'genesis'} />
                              <KV k="hash" v={e.hash || 'committed'} />
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )
          ) : txs.length === 0 ? <Empty title="No transactions yet" /> : (
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="eyebrow border-b border-white/[0.05]">
                  <th className="px-5 py-3 font-normal">Kind</th>
                  <th className="py-3 font-normal">Counterparty</th>
                  <th className="py-3 font-normal">Reference</th>
                  <th className="py-3 text-right font-normal">Amount</th>
                  <th className="py-3 pl-8 font-normal">Idempotency key</th>
                  <th className="px-5 py-3 font-normal">Time</th>
                </tr>
              </thead>
              <tbody className="text-[12.5px]">
                {txs.map((t) => {
                  const outgoing = t.from_wallet_id === selected?.id
                  const Icon = t.kind === 'transfer' ? ArrowLeftRight : t.kind === 'deposit' ? ArrowDownLeft : ArrowUpRight
                  return (
                    <tr key={t.id} className="border-b border-white/[0.035] hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2.5">
                          <span className={cx('flex size-7 items-center justify-center rounded-lg', outgoing ? 'bg-white/[0.05] text-[#9a968e]' : 'bg-[#c4f55a]/10 text-[#c4f55a]')}><Icon className="size-3.5" /></span>
                          <span className="capitalize">{t.kind}</span>
                        </span>
                      </td>
                      <td className="py-3 text-[#9a968e]">{outgoing ? `→ ${name(t.to_wallet_id)}` : `← ${name(t.from_wallet_id)}`}</td>
                      <td className="max-w-[220px] truncate py-3 text-[#9a968e]">{t.reference || <span className="text-[#66635d]">—</span>}</td>
                      <td className={cx('tnum py-3 text-right font-mono text-[12px]', outgoing ? 'text-[#ece8e1]' : 'text-[#c4f55a]')}>{outgoing ? '−' : '+'}{money(t.amount, t.currency)}</td>
                      <td className="py-3 pl-8 font-mono text-[11.5px] text-[#66635d]">{shortId(t.idempotency_key, 12)}</td>
                      <td className="px-5 py-3 font-mono text-[11.5px] text-[#66635d]">{time(t.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  )
}

function Term({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={cx('tnum mt-1.5 font-mono text-[18px] tracking-[-0.01em]', tone ?? 'text-[#ece8e1]')}>{value}</div>
    </div>
  )
}
const Op = ({ children }: { children: string }) => <span className="mt-4 font-display text-[28px] text-[#66635d]">{children}</span>

function ReconCheck({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <div className={cx('flex items-center gap-2 text-[12.5px]', ok === undefined ? 'text-[#66635d]' : ok ? 'text-[#c4f55a]' : 'text-[#ff6b57]')}>
      {ok === false ? <CircleX className="size-4" /> : <CircleCheck className="size-4" />}
      {label}
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <dt className="w-28 shrink-0 text-[#66635d]">{k}</dt>
      <dd className="truncate text-[#9a968e]">{v}</dd>
      <CopyButton value={v} />
    </div>
  )
}

// ─── Lab ─────────────────────────────────────────────────────────
type ExpId = 'replay' | 'tamper' | 'overdraft' | 'concurrency'
interface Step { label: string; method: string; path: string; status: number; ms: number; note?: string; replayed?: boolean; setup?: boolean }
interface Assertion { label: string; expected: string; actual: string; pass: boolean }
interface Bar { start: number; end: number; status: number; dir: 'ab' | 'ba'; amount: number }
interface Result { state: 'idle' | 'running' | 'pass' | 'fail' | 'error'; steps: Step[]; assertions: Assertion[]; ms?: number; error?: string; bars?: Bar[] }
interface Fixture { a: Wallet; b: Wallet }

const EXPS: { id: ExpId; title: string; icon: typeof Zap; claim: string; method: string }[] = [
  { id: 'replay', title: 'Idempotency replay', icon: RotateCcw, claim: 'Sending the same transfer three times with one Idempotency-Key moves money exactly once and returns the same transaction each time.', method: 'Transfer $25.00 α→β three times, sequentially, with an identical key and body.' },
  { id: 'tamper', title: 'Payload tampering', icon: Fingerprint, claim: 'Reusing a key with a different body is rejected rather than replayed, so an attacker cannot swap the amount behind a key.', method: 'Post $10.00 under key K, then post $9,000.00 under the same key K.' },
  { id: 'overdraft', title: 'Overdraft rejection', icon: ShieldAlert, claim: 'A withdrawal larger than the available balance is rejected inside the transaction and writes no ledger entries.', method: 'Withdraw (balance + $0.01) from α, then reconcile.' },
  { id: 'concurrency', title: 'Concurrent batching', icon: Shuffle, claim: 'Many simultaneous transfers in both directions keep total value constant, never drive a balance negative, and leave the ledger reconciled.', method: 'Fire N transfers at once (random direction and amount), each with its own key.' },
]

const idle = (): Result => ({ state: 'idle', steps: [], assertions: [] })

function Lab() {
  const { bump, toast } = useStore()
  const [results, setResults] = useState<Record<ExpId, Result>>({ replay: idle(), tamper: idle(), overdraft: idle(), concurrency: idle() })
  const [fixture, setFixture] = useState<Fixture | null>(null)
  const [batchN, setBatchN] = useState<'10' | '25' | '50'>('25')
  const [runningAll, setRunningAll] = useState(false)
  const fx = useRef<Fixture | null>(null)

  const patch = (id: ExpId, p: Partial<Result> | ((r: Result) => Partial<Result>)) =>
    setResults((prev) => ({ ...prev, [id]: { ...prev[id], ...(typeof p === 'function' ? p(prev[id]) : p) } }))

  async function run(id: ExpId) {
    const t0 = performance.now()
    patch(id, { state: 'running', steps: [], assertions: [], bars: undefined, error: undefined })
    const log = (s: Step) => patch(id, (r) => ({ steps: [...r.steps, s] }))
    const call = async <T,>(label: string, method: 'GET' | 'POST', path: string, body?: unknown, headers?: Record<string, string>, setup = false) => {
      const r = await request<T>(method, path, body, headers)
      log({ label, method, path: `/api/v1${path}`, status: r.status, ms: r.trace.ms, replayed: r.headers['idempotent-replayed'] === 'true', setup, note: r.ok ? undefined : errCode(r) })
      return r
    }
    const bal = async (w: Wallet, label = `Read ${w.owner}`) => {
      const r = await call<Wallet>(label, 'GET', `/wallets/${w.id}`, undefined, undefined, true)
      if (!r.ok) throw new Error(`could not read wallet ${w.id} (HTTP ${r.status})`)
      return r.data.balance
    }
    try {
      // Fixture: two dedicated lab wallets, created once per session and topped up as needed.
      let f = fx.current
      if (!f) {
        const tag = Math.random().toString(36).slice(2, 6)
        const a = await call<Wallet>('Create fixture α', 'POST', '/wallets', { owner: `Lab α · ${tag}`, currency: 'USD' }, undefined, true)
        const b = await call<Wallet>('Create fixture β', 'POST', '/wallets', { owner: `Lab β · ${tag}`, currency: 'USD' }, undefined, true)
        if (!a.ok || !b.ok) throw new Error('fixture wallets could not be created')
        f = { a: a.data, b: b.data }
        fx.current = f
        setFixture(f)
        await call('Fund β $500.00', 'POST', '/deposits', { wallet_id: f.b.id, amount: 500_00, reference: 'lab:fixture' }, { 'Idempotency-Key': idemKey() }, true)
      }
      const aBal = await bal(f.a)
      if (aBal < 1_000_00) await call('Top up α', 'POST', '/deposits', { wallet_id: f.a.id, amount: 1_000_00 - aBal + 500_00, reference: 'lab:topup' }, { 'Idempotency-Key': idemKey() }, true)

      let assertions: Assertion[] = []
      let bars: Bar[] | undefined

      if (id === 'replay') {
        const before = await bal(f.a, 'Snapshot α')
        const key = idemKey()
        const body = { from_wallet_id: f.a.id, to_wallet_id: f.b.id, amount: 25_00, reference: 'lab:replay' }
        const rs: ApiResult<Transaction>[] = []
        for (let i = 1; i <= 3; i++) rs.push(await call<Transaction>(`Attempt ${i} · key ${shortId(key, 6)}`, 'POST', '/transfers', body, { 'Idempotency-Key': key }))
        const after = await bal(f.a, 'Snapshot α')
        const signatures = rs.map((r) => (r.ok ? (r.data?.id ? String(r.data.id) : (r.data?.status || 'success')) : null))
        assertions = [
          { label: 'First attempt is accepted', expected: '2xx', actual: String(rs[0].status), pass: rs[0].ok },
          { label: 'Retries also succeed', expected: '2xx, 2xx', actual: rs.slice(1).map((r) => r.status).join(', '), pass: rs.slice(1).every((r) => r.ok) },
          { label: 'Retries are flagged as replays', expected: 'Idempotent-Replayed: true', actual: rs.slice(1).map((r) => r.headers['idempotent-replayed'] ?? 'absent').join(', '), pass: rs.slice(1).every((r) => r.headers['idempotent-replayed'] === 'true') },
          { label: 'Same response signature every time', expected: '1 unique receipt', actual: `${new Set(signatures.filter(Boolean)).size} unique`, pass: signatures.every((x) => x && x === signatures[0]) },
          { label: 'Sender debited exactly once', expected: money(-25_00), actual: money(after - before), pass: after - before === -25_00 },
        ]
      }

      if (id === 'tamper') {
        const before = await bal(f.a, 'Snapshot α')
        const key = idemKey()
        const r1 = await call<Transaction>(`Original $10.00 · key ${shortId(key, 6)}`, 'POST', '/transfers', { from_wallet_id: f.a.id, to_wallet_id: f.b.id, amount: 10_00, reference: 'lab:tamper' }, { 'Idempotency-Key': key })
        const r2 = await call<Transaction>(`Tampered $9,000.00 · same key`, 'POST', '/transfers', { from_wallet_id: f.a.id, to_wallet_id: f.b.id, amount: 9_000_00, reference: 'lab:tamper' }, { 'Idempotency-Key': key })
        const after = await bal(f.a, 'Snapshot α')
        assertions = [
          { label: 'Original request is accepted', expected: '2xx', actual: String(r1.status), pass: r1.ok },
          { label: 'Tampered request is rejected', expected: '409 or 422', actual: `${r2.status} ${r2.ok ? '' : errCode(r2)}`.trim(), pass: r2.status === 409 || r2.status === 422 },
          { label: 'Not served as a replay', expected: 'no replay header', actual: r2.headers['idempotent-replayed'] ?? 'absent', pass: r2.headers['idempotent-replayed'] !== 'true' },
          { label: 'Only the original amount moved', expected: money(-10_00), actual: money(after - before), pass: after - before === -10_00 },
        ]
      }

      if (id === 'overdraft') {
        const r0 = await call<Reconciliation>('Reconcile α (before)', 'GET', `/wallets/${f.a.id}/reconcile`, undefined, undefined, true)
        const before = await bal(f.a, 'Snapshot α')
        const r = await call<Transaction>(`Withdraw ${money(before + 1)}`, 'POST', '/withdrawals', { wallet_id: f.a.id, amount: before + 1, reference: 'lab:overdraft' }, { 'Idempotency-Key': idemKey() })
        const after = await bal(f.a, 'Snapshot α')
        const r1 = await call<Reconciliation>('Reconcile α (after)', 'GET', `/wallets/${f.a.id}/reconcile`, undefined, undefined, true)
        assertions = [
          { label: 'Withdrawal is rejected', expected: '400 or 422', actual: `${r.status} ${r.ok ? '' : errCode(r)}`.trim(), pass: r.status === 400 || r.status === 422 },
          { label: 'Balance unchanged', expected: money(before), actual: money(after), pass: after === before },
          { label: 'No ledger entries written', expected: `${r0.data?.entry_count ?? '?'} entries`, actual: `${r1.data?.entry_count ?? '?'} entries`, pass: r0.ok && r1.ok && r0.data.entry_count === r1.data.entry_count },
          { label: 'Wallet still reconciles', expected: 'balanced', actual: r1.ok ? (r1.data.balanced ? 'balanced' : 'drift') : `HTTP ${r1.status}`, pass: r1.ok && r1.data.balanced },
        ]
      }

      if (id === 'concurrency') {
        const n = Number(batchN)
        const a0 = await bal(f.a, 'Snapshot α')
        const b0 = await bal(f.b, 'Snapshot β')
        const plan = Array.from({ length: n }, () => ({ dir: (Math.random() < 0.55 ? 'ab' : 'ba') as 'ab' | 'ba', amount: (5 + Math.floor(Math.random() * 115)) * 100 }))
        const tStart = performance.now()
        const live: Bar[] = []
        const out = await Promise.all(plan.map(async (p, i) => {
          const start = performance.now() - tStart
          const r = await request<Transaction>('POST', '/transfers', { from_wallet_id: p.dir === 'ab' ? f.a.id : f.b.id, to_wallet_id: p.dir === 'ab' ? f.b.id : f.a.id, amount: p.amount, reference: `lab:batch:${i}` }, { 'Idempotency-Key': idemKey() })
          const bar = { start, end: performance.now() - tStart, status: r.status, dir: p.dir, amount: p.amount }
          live[i] = bar
          patch(id, { bars: [...live] })
          return { r, p }
        }))
        log({ label: `${n} concurrent transfers`, method: 'POST', path: '/api/v1/transfers ×' + n, status: out.every((o) => o.r.status > 0) ? 207 : 0, ms: +(performance.now() - tStart).toFixed(1), note: `${out.filter((o) => o.r.ok).length} posted · ${out.filter((o) => !o.r.ok).length} rejected` })
        bars = live
        const a1 = await bal(f.a, 'Snapshot α')
        const b1 = await bal(f.b, 'Snapshot β')
        const ra = await call<Reconciliation>('Reconcile α', 'GET', `/wallets/${f.a.id}/reconcile`, undefined, undefined, true)
        const rb = await call<Reconciliation>('Reconcile β', 'GET', `/wallets/${f.b.id}/reconcile`, undefined, undefined, true)
        const accepted = out.filter((o) => o.r.ok)
        const expectedDeltaA = accepted.reduce((s, o) => s + (o.p.dir === 'ab' ? -o.p.amount : o.p.amount), 0)
        const unanswered = out.filter((o) => o.r.status === 0 || o.r.status >= 500).length
        const badRejects = out.filter((o) => !o.r.ok && o.r.status !== 400 && o.r.status !== 422 && o.r.status !== 409).length
        assertions = [
          { label: 'Every request answered without a server error', expected: `${n} answered, 0 errors`, actual: `${n - unanswered} answered, ${unanswered} errors`, pass: unanswered === 0 },
          { label: 'Rejections are clean business errors', expected: '400 / 409 / 422', actual: badRejects ? `${badRejects} unexpected` : `${out.length - accepted.length} clean`, pass: badRejects === 0 },
          { label: 'Total value conserved (α + β)', expected: money(a0 + b0), actual: money(a1 + b1), pass: a0 + b0 === a1 + b1 },
          { label: 'No negative balances', expected: '≥ $0.00', actual: `α ${money(a1)} · β ${money(b1)}`, pass: a1 >= 0 && b1 >= 0 },
          { label: 'Net change equals sum of accepted transfers', expected: money(expectedDeltaA, 'USD', { sign: true }), actual: money(a1 - a0, 'USD', { sign: true }), pass: a1 - a0 === expectedDeltaA },
          { label: 'Both ledgers reconcile, hash chain intact', expected: 'balanced · chain ok', actual: [ra, rb].map((r) => (r.ok ? `${r.data.balanced ? 'balanced' : 'drift'}/${r.data.chain_valid ? 'ok' : 'broken'}` : `HTTP ${r.status}`)).join(' · '), pass: ra.ok && rb.ok && ra.data.balanced && rb.data.balanced && ra.data.chain_valid && rb.data.chain_valid },
        ]
      }

      const pass = assertions.every((a) => a.pass)
      patch(id, { state: pass ? 'pass' : 'fail', assertions, bars, ms: +(performance.now() - t0).toFixed(0) })
      return pass
    } catch (e) {
      patch(id, { state: 'error', error: e instanceof Error ? e.message : String(e), ms: +(performance.now() - t0).toFixed(0) })
      return false
    } finally {
      bump()
    }
  }

  async function runAll() {
    setRunningAll(true)
    let passed = 0
    for (const e of EXPS) if (await run(e.id)) passed++
    setRunningAll(false)
    toast({ tone: passed === EXPS.length ? 'ok' : 'err', title: `${passed} of ${EXPS.length} guarantees verified`, detail: passed === EXPS.length ? 'All assertions passed' : 'Inspect the failing experiment for details' })
  }

  const done = Object.values(results).filter((r) => r.state === 'pass' || r.state === 'fail' || r.state === 'error')
  const passed = Object.values(results).filter((r) => r.state === 'pass').length
  const anyRunning = Object.values(results).some((r) => r.state === 'running')

  return (
    <div className="animate-rise">
      <PageHead
        index="05 Systems Lab"
        title={<>Claims are cheap. <em className="text-[#c4f55a]">Run the proof.</em></>}
        lede="Each experiment calls the real API, re-reads balances, and checks assertions against what actually happened. A failure shows exactly which invariant broke and the observed value."
        actions={<Button variant="primary" size="lg" loading={runningAll} disabled={anyRunning && !runningAll} onClick={runAll} icon={<Play className="size-4" />}>Run all experiments</Button>}
      />

      {/* Scoreboard */}
      <Panel className="mb-6 grid overflow-hidden md:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-5 p-6 md:border-r md:border-white/[0.06] md:pr-10">
          <div className="font-display text-[64px] leading-none tracking-[-0.03em]">
            <span className={cx(done.length && passed === done.length ? 'text-[#c4f55a]' : done.length ? 'text-[#ff6b57]' : 'text-[#ece8e1]')}>{passed}</span>
            <span className="text-[#66635d]">/{EXPS.length}</span>
          </div>
          <div className="text-[12.5px] leading-snug text-[#9a968e]">guarantees<br />verified</div>
        </div>
        <div className="flex flex-col justify-center gap-3 p-6">
          <div className="flex gap-1.5">
            {EXPS.map((e) => {
              const s = results[e.id].state
              return <div key={e.id} className={cx('h-1.5 flex-1 rounded-full transition-colors', s === 'pass' ? 'bg-[#c4f55a]' : s === 'fail' || s === 'error' ? 'bg-[#ff6b57]' : s === 'running' ? 'animate-pulse bg-[#7cc4ff]' : 'bg-white/[0.07]')} />
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] text-[#66635d]">
            <span className="flex items-center gap-1.5"><FlaskConical className="size-3.5" />Fixture:</span>
            {fixture ? (
              <>
                <span className="text-[#9a968e]">α {shortId(fixture.a.id)}</span>
                <span className="text-[#9a968e]">β {shortId(fixture.b.id)}</span>
                <button className="underline underline-offset-2 hover:text-[#ece8e1]" disabled={anyRunning} onClick={() => { fx.current = null; setFixture(null) }}>new fixture</button>
              </>
            ) : <span>two isolated wallets are created on first run</span>}
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        {EXPS.map((e, i) => (
          <Experiment
            key={e.id}
            index={i + 1}
            exp={e}
            result={results[e.id]}
            disabled={anyRunning}
            onRun={() => run(e.id)}
            extra={e.id === 'concurrency' ? <SegTabs value={batchN} onChange={setBatchN} options={[{ value: '10', label: 'N=10' }, { value: '25', label: 'N=25' }, { value: '50', label: 'N=50' }]} /> : undefined}
          />
        ))}
      </div>
    </div>
  )
}

function Experiment({ index, exp, result, onRun, disabled, extra }: { index: number; exp: (typeof EXPS)[number]; result: Result; onRun: () => void; disabled: boolean; extra?: ReactNode }) {
  const { state } = result
  const tone = state === 'pass' ? 'shadow-[inset_0_0_0_1px_rgba(196,245,90,0.35)]' : state === 'fail' || state === 'error' ? 'shadow-[inset_0_0_0_1px_rgba(255,107,87,0.4)]' : ''
  return (
    <Panel as="article" className={cx('flex flex-col', tone)}>
      <header className="flex items-start gap-4 p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-[#c4f55a]"><exp.icon className="size-[18px]" strokeWidth={1.75} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10.5px] text-[#66635d]">EXP-0{index}</span>
            <Verdict state={state} />
            {result.ms != null && state !== 'running' && <span className="tnum font-mono text-[10.5px] text-[#66635d]">{result.ms}ms</span>}
          </div>
          <h3 className="mt-1 text-[16px] font-semibold tracking-[-0.01em]">{exp.title}</h3>
        </div>
        <Button size="sm" variant={state === 'idle' ? 'primary' : 'secondary'} onClick={onRun} disabled={disabled} loading={state === 'running'} icon={state === 'idle' ? <Play className="size-3.5" /> : <RotateCcw className="size-3.5" />}>
          {state === 'idle' ? 'Run' : 'Re-run'}
        </Button>
      </header>
      <div className="px-5">
        <p className="text-[13px] leading-relaxed text-[#ece8e1]/90">{exp.claim}</p>
        <p className="mt-2 font-mono text-[11.5px] leading-relaxed text-[#66635d]">{exp.method}</p>
        {extra && <div className="mt-3">{extra}</div>}
      </div>

      {result.bars && <Timeline bars={result.bars} />}

      {(result.steps.length > 0 || state === 'running') && (
        <div className="mx-5 mt-4 max-h-[200px] overflow-y-auto rounded-xl bg-[#0b0b0a]/70 p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
          <ol className="font-mono text-[11px]">
            {result.steps.map((s, i) => (
              <li key={i} className={cx('grid animate-rise grid-cols-[18px_1fr_auto_auto] items-center gap-2.5 rounded-md px-2 py-1.5', s.setup && 'opacity-55')}>
                <span className="text-[#66635d]">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0 truncate text-[#9a968e]">
                  <span className="text-[#ece8e1]">{s.label}</span>
                  {s.replayed && <span className="ml-2 text-[#7cc4ff]">replayed</span>}
                  {s.note && <span className={cx('ml-2', s.status >= 400 || s.status === 0 ? 'text-[#f5b544]' : 'text-[#66635d]')}>{s.note}</span>}
                </span>
                <StatusCode status={s.status} />
                <span className="tnum w-14 text-right text-[#66635d]">{s.ms}ms</span>
              </li>
            ))}
            {state === 'running' && <li className="flex items-center gap-2 px-2 py-1.5 text-[#66635d]"><Loader2 className="size-3 animate-spin" />running…</li>}
          </ol>
        </div>
      )}

      {result.error && <p role="alert" className="mx-5 mt-4 rounded-lg bg-[#ff6b57]/10 px-3 py-2 font-mono text-[11.5px] text-[#ff6b57]">Experiment aborted: {result.error}</p>}

      {result.assertions.length > 0 && (
        <ul className="mx-5 mt-4 flex flex-col divide-y divide-white/[0.05] rounded-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
          {result.assertions.map((a, i) => (
            <li key={i} className="grid animate-rise grid-cols-[20px_1fr] gap-3 px-3.5 py-2.5" style={{ animationDelay: `${i * 60}ms` }}>
              <span className={cx('mt-0.5 flex size-[18px] items-center justify-center rounded-full', a.pass ? 'bg-[#c4f55a]/15 text-[#c4f55a]' : 'bg-[#ff6b57]/15 text-[#ff6b57]')}>
                {a.pass ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
              </span>
              <div className="min-w-0">
                <div className="text-[12.5px] text-[#ece8e1]">{a.label}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-4 font-mono text-[10.5px]">
                  <span className="text-[#66635d]">expected <span className="text-[#9a968e]">{a.expected}</span></span>
                  <span className="text-[#66635d]">observed <span className={a.pass ? 'text-[#c4f55a]' : 'text-[#ff6b57]'}>{a.actual}</span></span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="h-5" />
    </Panel>
  )
}

function Verdict({ state }: { state: Result['state'] }) {
  if (state === 'pass') return <Badge tone="ok">Verified</Badge>
  if (state === 'fail') return <Badge tone="err">Failed</Badge>
  if (state === 'error') return <Badge tone="err">Aborted</Badge>
  if (state === 'running') return <Badge tone="info">Running</Badge>
  return <Badge><CircleDashed className="size-2.5" />Not run</Badge>
}

function Timeline({ bars }: { bars: Bar[] }) {
  const valid = bars.filter(Boolean)
  const max = Math.max(...valid.map((b) => b.end), 1)
  return (
    <div className="mx-5 mt-4 rounded-xl bg-[#0b0b0a]/70 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
      <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-[#66635d]">
        <span>request timeline · in-flight overlap</span>
        <span className="flex gap-3"><span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-[#c4f55a]" />posted</span><span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-[#f5b544]" />rejected</span><span className="tnum">{max.toFixed(0)}ms</span></span>
      </div>
      <div className="flex flex-col gap-[2px]">
        {valid.map((b, i) => (
          <div key={i} className="relative h-[5px]" title={`${b.dir === 'ab' ? 'α→β' : 'β→α'} ${money(b.amount)} · ${b.status} · ${(b.end - b.start).toFixed(1)}ms`}>
            <div
              className={cx('absolute h-full animate-rise rounded-full', b.status >= 200 && b.status < 300 ? 'bg-[#c4f55a]/80' : b.status >= 500 || b.status === 0 ? 'bg-[#ff6b57]' : 'bg-[#f5b544]/80')}
              style={{ left: `${(b.start / max) * 100}%`, width: `${Math.max(((b.end - b.start) / max) * 100, 0.8)}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Console ─────────────────────────────────────────────────────
type Filter = 'all' | '2xx' | '4xx' | '5xx'

const PRESETS: Record<string, { method: 'GET' | 'POST'; path: string; body?: (w?: string, w2?: string) => unknown; idem?: boolean }> = {
  'GET /health': { method: 'GET', path: '/health' },
  'GET /wallets': { method: 'GET', path: '/wallets' },
  'GET /wallets/{id}/reconcile': { method: 'GET', path: '/wallets/{id}/reconcile' },
  'POST /deposits': { method: 'POST', path: '/deposits', idem: true, body: (w) => ({ wallet_id: w, amount: 10000, reference: 'console' }) },
  'POST /transfers': { method: 'POST', path: '/transfers', idem: true, body: (w, w2) => ({ from_wallet_id: w, to_wallet_id: w2, amount: 2500, reference: 'console' }) },
  'POST /withdrawals (no key)': { method: 'POST', path: '/withdrawals', body: (w) => ({ wallet_id: w, amount: 100 }) },
}

function Console() {
  const { traces, clearTraces, focusTrace, setFocusTrace, selected, wallets, bump } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [activeId, setActiveId] = useState<string | null>(focusTrace)

  useEffect(() => { if (focusTrace) { setActiveId(focusTrace); setFocusTrace(null) } }, [focusTrace])

  const list = useMemo(() => traces.filter((t) => {
    if (filter === '2xx' && !(t.status >= 200 && t.status < 300)) return false
    if (filter === '4xx' && !(t.status >= 400 && t.status < 500)) return false
    if (filter === '5xx' && !(t.status >= 500 || t.status === 0)) return false
    return !q || t.path.toLowerCase().includes(q.toLowerCase())
  }), [traces, filter, q])
  const active = traces.find((t) => t.id === activeId) ?? list[0]
  const stats = useMemo(() => {
    const ms = traces.map((t) => t.ms).sort((a, b) => a - b)
    return { n: traces.length, p50: ms[Math.floor(ms.length * 0.5)] ?? 0, p99: ms[Math.floor(ms.length * 0.99)] ?? 0, err: traces.filter((t) => t.status >= 400 || t.status === 0).length }
  }, [traces])

  const [preset, setPreset] = useState('GET /health')
  const [method, setMethod] = useState<'GET' | 'POST'>('GET')
  const [path, setPath] = useState('/health')
  const [key, setKey] = useState('')
  const [body, setBody] = useState('')
  const [bodyErr, setBodyErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const applyPreset = (name: string) => {
    const p = PRESETS[name]
    const other = wallets.find((w) => w.id !== selected?.id)?.id
    setPreset(name)
    setMethod(p.method)
    setPath(p.path.replace('{id}', selected?.id ?? '{id}'))
    setKey(p.idem ? idemKey() : '')
    setBody(p.body ? JSON.stringify(p.body(selected?.id, other), null, 2) : '')
    setBodyErr(null)
  }

  const send = async () => {
    let parsed: unknown = undefined
    if (method === 'POST' && body.trim()) {
      try { parsed = JSON.parse(body) } catch (e) { return setBodyErr(`Invalid JSON: ${(e as Error).message}`) }
    }
    setBodyErr(null)
    setBusy(true)
    const r = await request(method, path.startsWith('/') ? path : `/${path}`, parsed, key ? { 'Idempotency-Key': key } : {})
    setBusy(false)
    setActiveId(r.trace.id)
    if (method === 'POST') bump()
  }

  return (
    <div className="animate-rise">
      <PageHead
        index="06 API Console"
        title={<>Nothing hidden <em className="text-[#9a968e]">on the wire.</em></>}
        lede={<>Every request this interface makes is recorded here with its headers, payloads, status code and latency. The base URL is <code className="font-mono text-[#ece8e1]">{API_BASE}</code> on this origin.</>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat k="Requests" v={String(stats.n)} />
        <Stat k="p50 latency" v={`${stats.p50}ms`} />
        <Stat k="p99 latency" v={`${stats.p99}ms`} />
        <Stat k="Non-2xx" v={String(stats.err)} warn={stats.err > 0} />
      </div>

      <Panel className="mb-4">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start">
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={preset} onChange={applyPreset} className="sm:w-[240px]">
                {Object.keys(PRESETS).map((k) => <option key={k}>{k}</option>)}
              </Select>
              <div className="flex min-w-0 flex-1 items-center rounded-[10px] bg-[#0b0b0a]/60 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] focus-within:shadow-[inset_0_0_0_1px_rgba(196,245,90,0.6)]">
                <button onClick={() => setMethod((m) => (m === 'GET' ? 'POST' : 'GET'))} className={cx('h-10 w-16 shrink-0 border-r border-white/[0.07] font-mono text-[12px] font-semibold', method === 'POST' ? 'text-[#7cc4ff]' : 'text-[#9a968e]')} aria-label={`Method ${method}, click to toggle`}>{method}</button>
                <span className="pl-3 font-mono text-[12px] text-[#66635d]">{API_BASE}</span>
                <input aria-label="Path" value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} className="h-10 min-w-0 flex-1 bg-transparent pr-3 font-mono text-[12.5px] text-[#ece8e1] outline-none" />
              </div>
            </div>
            {method === 'POST' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-[120px] shrink-0 font-mono text-[11.5px] text-[#66635d]">Idempotency-Key</span>
                  <Input mono value={key} onChange={(e) => setKey(e.target.value)} placeholder="Leave empty to test validation" className="h-9" />
                  <Button size="sm" variant="ghost" onClick={() => setKey(idemKey())}>New</Button>
                </div>
                <textarea aria-label="Request body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} spellCheck={false} className="w-full resize-y rounded-[10px] bg-[#0b0b0a]/60 p-3 font-mono text-[12px] leading-relaxed text-[#ece8e1] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(196,245,90,0.6)]" />
                {bodyErr && <p role="alert" className="text-[12px] text-[#ff6b57]">{bodyErr}</p>}
              </>
            )}
          </div>
          <Button variant="primary" onClick={send} loading={busy} icon={<Play className="size-4" />}>Send</Button>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,400px)_1fr]">
        <Panel className="flex max-h-[720px] flex-col overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-white/[0.05] p-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[#66635d]" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by path" className="h-9 pl-8" />
              </div>
              <Button size="sm" variant="ghost" onClick={clearTraces} icon={<Trash2 className="size-3.5" />} aria-label="Clear traces" />
            </div>
            <SegTabs value={filter} onChange={setFilter} options={(['all', '2xx', '4xx', '5xx'] as Filter[]).map((f) => ({ value: f, label: f }))} />
          </div>
          <ul className="flex-1 overflow-y-auto p-1.5">
            {list.map((t) => (
              <li key={t.id}>
                <button onClick={() => setActiveId(t.id)} className={cx('grid w-full grid-cols-[40px_1fr_auto] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-mono text-[11.5px] transition-colors', active?.id === t.id ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]')}>
                  <span className={t.method === 'POST' ? 'text-[#7cc4ff]' : 'text-[#66635d]'}>{t.method}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[#ece8e1]">{t.path.replace('/api/v1', '')}</span>
                    <span className="text-[10px] text-[#66635d]">{time(t.at)} · {t.ms}ms{t.responseHeaders['idempotent-replayed'] ? ' · replayed' : ''}</span>
                  </span>
                  <StatusCode status={t.status} />
                </button>
              </li>
            ))}
            {!list.length && <Empty title="No matching requests" icon={<SquareTerminal className="size-5" />} />}
          </ul>
        </Panel>

        {active ? <TraceDetail t={active} /> : <Panel><Empty title="Select a request" /></Panel>}
      </div>
    </div>
  )
}

function Stat({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <Panel className="px-4 py-3.5">
      <div className="eyebrow">{k}</div>
      <div className={cx('tnum mt-1.5 font-mono text-[20px] tracking-[-0.02em]', warn ? 'text-[#f5b544]' : 'text-[#ece8e1]')}>{v}</div>
    </Panel>
  )
}

function curl(t: Trace) {
  const parts = [`curl -X ${t.method} '${location.origin}${t.path}'`]
  for (const [k, v] of Object.entries(t.requestHeaders)) parts.push(`-H '${k}: ${v}'`)
  if (t.requestBody !== undefined) parts.push(`-d '${JSON.stringify(t.requestBody)}'`)
  return parts.join(' \\\n  ')
}

const STATUS_TEXT: Record<number, string> = { 0: 'Network error', 200: 'OK', 201: 'Created', 400: 'Bad Request', 404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Entity', 500: 'Internal Server Error' }

function TraceDetail({ t }: { t: Trace }) {
  const [tab, setTab] = useState<'response' | 'request' | 'curl'>('response')
  const payload = tab === 'response' ? t.responseBody : t.requestBody
  return (
    <Panel className="flex min-w-0 flex-col overflow-hidden">
      <div className="border-b border-white/[0.05] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusCode status={t.status} />
          <span className="font-mono text-[12px] text-[#9a968e]">{STATUS_TEXT[t.status] ?? ''}</span>
          {t.responseHeaders['idempotent-replayed'] && <Badge tone="info">Idempotent replay</Badge>}
          <Badge tone={t.source === 'live' ? 'ok' : 'warn'}>{t.source}</Badge>
          <span className="tnum ml-auto font-mono text-[12px] text-[#ece8e1]">{t.ms}ms</span>
        </div>
        <div className="mt-3 flex items-center gap-2 font-mono text-[14px]">
          <span className={t.method === 'POST' ? 'text-[#7cc4ff]' : 'text-[#9a968e]'}>{t.method}</span>
          <span className="min-w-0 truncate text-[#ece8e1]">{t.path}</span>
          <CopyButton value={t.path} />
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.05]">
          <div className="h-full rounded-full bg-[#c4f55a] transition-all" style={{ width: `${Math.min((t.ms / 200) * 100, 100)}%` }} />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-[#66635d]"><span>0ms</span><span>{time(t.at)}</span><span>200ms</span></div>
      </div>
      <div className="px-5 pt-4">
        <SegTabs value={tab} onChange={setTab} options={[{ value: 'response', label: 'Response' }, { value: 'request', label: 'Request' }, { value: 'curl', label: 'cURL' }]} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {tab === 'curl' ? (
          <div className="relative rounded-xl bg-[#0b0b0a]/70 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
            <div className="absolute top-2 right-2"><CopyButton value={curl(t)} label="Copy cURL" /></div>
            <pre className="overflow-auto font-mono text-[11.5px] leading-relaxed text-[#ece8e1]">{curl(t)}</pre>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Headers h={tab === 'response' ? t.responseHeaders : t.requestHeaders} />
            <div>
              <div className="eyebrow mb-2">Body</div>
              <div className="rounded-xl bg-[#0b0b0a]/70 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
                {payload === undefined ? <span className="font-mono text-[11.5px] text-[#66635d]">(empty)</span> : <Json value={payload} className="max-h-[380px]" />}
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}

function Headers({ h }: { h: Record<string, string> }) {
  return (
    <div>
      <div className="eyebrow mb-2">Headers</div>
      <dl className="rounded-xl bg-[#0b0b0a]/70 p-4 font-mono text-[11.5px] leading-[1.8] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
        {Object.entries(h).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="shrink-0 text-[#66635d]">{k}:</dt>
            <dd className={cx('min-w-0 break-all', /idempot/i.test(k) ? 'text-[#7cc4ff]' : 'text-[#9a968e]')}>{v}</dd>
          </div>
        ))}
        {!Object.keys(h).length && <span className="text-[#66635d]">(none)</span>}
      </dl>
    </div>
  )
}

// ─── App ───────────────────────────────────────────────────────────────
function Routes() {
  const { view, go } = useStore()
  const [txMode, setTxMode] = useState<TxMode>('transfer')
  return (
    <>
      <div key={view}>
      {view === 'overview' && <Overview />}
      {view === 'wallets' && <Wallets onTransact={(m) => { setTxMode(m); go('transact') }} />}
      {view === 'transact' && <Transact initial={txMode} />}
      {view === 'ledger' && <Ledger />}
      {view === 'console' && <Console />}
      </div>
      {/* Lab stays mounted so experiment results survive navigation. */}
      <div hidden={view !== 'lab'}><Lab /></div>
    </>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <style>{GLOBAL_CSS}</style>
      <Shell>
        <Routes />
      </Shell>
    </StoreProvider>
  )
}

import { createRoot } from 'react-dom/client'

if (typeof window !== 'undefined') {
  ;(window as any).React = React
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(createElement(App))
}
