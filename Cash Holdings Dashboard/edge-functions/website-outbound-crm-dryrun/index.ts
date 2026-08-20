import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js'
import * as XLSX from 'npm:xlsx'

// ── CORS: explicit allow-list only, never a wildcard ────────────────────────
// Matches the convention used by the other Cash Holdings edge functions.
const DEFAULT_ORIGINS = [
  'https://truett.cash',
  'https://cash-holdings-os.lovable.app',
]

function allowedOrigins(): string[] {
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean)
  return Array.from(new Set([...DEFAULT_ORIGINS, ...configured]))
}

function originApproved(origin: string): boolean {
  const clean = (origin ?? '').replace(/\/$/, '')
  return allowedOrigins().includes(clean) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(clean)
}

function corsHeadersFor(origin: string | null): Record<string, string> {
  const clean = (origin ?? '').replace(/\/$/, '')
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
  if (clean && originApproved(clean)) headers['Access-Control-Allow-Origin'] = clean
  return headers
}

/**
 * Verifies the caller's Supabase session AND owner role before any private
 * data is touched. Fails closed: only an explicit `true` from has_role
 * authorizes. Any missing header, invalid token, RPC error or non-boolean
 * result is unauthorized.
 */
async function authenticateOwner(req: Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) return null

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  })

  const { data, error } = await anon.auth.getUser()
  if (error || !data.user) return null

  const { data: isOwner, error: roleError } = await anon.rpc('has_role', {
    _user_id: data.user.id,
    _role: 'owner',
  })
  if (roleError || isOwner !== true) return null

  return { id: data.user.id }
}

const STORAGE_BUCKET = 'private-imports'
const STORAGE_OBJECT = 'website-outbound/2026-08-04/Truett_Cash_Website_Outbound_CRM_2026-08-04 (1).xlsx'

/**
 * Walks the bucket (breadth-first, bounded) and returns every .xlsx object key.
 * Used only to resolve the workbook when the exact expected path is absent —
 * still read-only, no storage mutations.
 */
async function listXlsxKeys(admin: any, bucket: string): Promise<string[]> {
  const found: string[] = []
  const queue: string[] = ['']
  let visited = 0
  while (queue.length && visited < 200) {
    const prefix = queue.shift()!
    visited++
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
    if (error || !data) continue
    for (const entry of data) {
      const key = prefix ? `${prefix}/${entry.name}` : entry.name
      // Folders come back with a null id / no metadata.
      if (!entry.id) queue.push(key)
      else if (/\.xlsx$/i.test(entry.name)) found.push(key)
    }
  }
  return found
}

function normalizeSpace(s: unknown): string {
  return (s ?? '').toString().replace(/\s+/g, ' ').trim()
}

function parseMaybeNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const s = normalizeSpace(v)
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function parseExcelDateToISODate(v: any): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') {
    // Treat 0/blank as null
    if (v === 0) return null
    const d = XLSX.SSF.parse_date_code(v)
    if (!d || !d.y) return null
    const dt = new Date(Date.UTC(d.y, d.m - 1, d.d))
    return dt.toISOString().slice(0, 10)
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = normalizeSpace(v)
  if (!s) return null
  const dt = new Date(s)
  if (!Number.isFinite(dt.getTime())) return null
  return dt.toISOString().slice(0, 10)
}

function extractEmails(raw: string): string[] {
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  const matches = (raw || '').match(re) || []
  return [...new Set(matches.map((m) => m.toLowerCase()))]
}

function extractPrimaryEmail(raw: string): string | null {
  const emails = extractEmails(raw)
  return emails[0] || null
}

function normalizePhoneForMatch(raw: string): string | null {
  const digits = (raw ?? '').toString().replace(/\D+/g, '')
  return digits || null
}

function guessPhoneDisplay(raw: string): string | null {
  const s = (raw ?? '').toString().trim()
  return s || null
}

function toBrandKey(brandRoute: string): string | null {
  const v = normalizeSpace(brandRoute).toLowerCase()
  if (!v) return null
  if (v === 'truett cash' || v.includes('truett cash')) return 'truett-cash'
  if (v === 'authority systems' || v.includes('authority systems')) return 'authority-systems'
  return null
}

function tierToInt(tierRaw: string): 1 | 2 | 3 | null {
  const s = normalizeSpace(tierRaw).toLowerCase()
  if (!s) return null
  const m = s.match(/tier\s*([123])/) || s.match(/^([123])$/)
  if (!m) return null
  const n = Number(m[1])
  if (n === 1 || n === 2 || n === 3) return n as 1 | 2 | 3
  return null
}

function computeFitScore(need: number | null, reachability: number | null, buyerFit: number | null, nicheFit: number | null, upside: number | null, timing: number | null): number | null {
  if ([need, reachability, buyerFit, nicheFit, upside, timing].some((p) => p === null)) return null
  return (need as number) + (reachability as number) + (buyerFit as number) + (nicheFit as number) + (upside as number) + (timing as number)
}

function queueStageFromSpreadsheetStatus(statusRaw: string): string | null {
  // Map spreadsheet labels to existing engagement.pipeline_stage values (conservative).
  // If your CRM uses different internal keys, we will instead keep the mapping label in metadata.
  const s = normalizeSpace(statusRaw).toLowerCase()
  const map: Record<string, string> = {
    'research needed': 'research_needed',
    'new': 'new',
    'ready': 'ready',
    'contacted': 'contacted',
    'follow-up 1': 'follow_up_1',
    'follow-up 2': 'follow_up_2',
    'follow up 1': 'follow_up_1',
    'follow up 2': 'follow_up_2',
    'conversation': 'conversation',
    'audit sent': 'audit_sent',
    'proposal sent': 'proposal_sent',
    'won': 'won',
    'lost': 'lost',
    'nurture': 'nurture',
    'disqualified': 'disqualified',
  }
  // best-effort
  return map[s] || null
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = corsHeadersFor(req.headers.get('origin'))
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: corsHeaders })
    }

    // Authorization gate — must run BEFORE the service-role client exists and
    // therefore before any private Storage or database read.
    const owner = await authenticateOwner(req)
    if (!owner) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secrets' }), { status: 500, headers: corsHeaders })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
    })

    // Resolve the workbook: try the expected path first, then fall back to any
    // .xlsx found anywhere in the bucket (read-only discovery).
    let objectKey = STORAGE_OBJECT
    let download = await supabaseAdmin.storage.from(STORAGE_BUCKET).download(objectKey)

    if (download.error) {
      const candidates = await listXlsxKeys(supabaseAdmin, STORAGE_BUCKET)
      // Prefer a website-outbound workbook, else the only one present.
      const preferred =
        candidates.find((k) => /website[-_ ]?outbound/i.test(k) && /Website_Outbound_CRM/i.test(k)) ??
        candidates.find((k) => /Website_Outbound_CRM/i.test(k)) ??
        (candidates.length === 1 ? candidates[0] : undefined)

      if (!preferred) {
        return new Response(
          JSON.stringify({
            error: 'STORAGE_OBJECT_NOT_RESOLVED',
            message: download.error.message || String(download.error),
            bucket: STORAGE_BUCKET,
            expected_object: STORAGE_OBJECT,
            xlsx_candidates: candidates,
            hint: candidates.length
              ? 'Multiple/ambiguous workbooks found — rename to the expected path or narrow the bucket.'
              : 'No .xlsx object exists anywhere in this bucket. Upload the workbook, then re-run.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      objectKey = preferred
      download = await supabaseAdmin.storage.from(STORAGE_BUCKET).download(objectKey)
      if (download.error) {
        return new Response(
          JSON.stringify({
            error: 'STORAGE_OBJECT_NOT_RESOLVED',
            message: download.error.message || String(download.error),
            bucket: STORAGE_BUCKET,
            resolved_object: objectKey,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const arrayBuffer = await download.data!.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })

    const sheet = workbook.Sheets['Lead CRM']
    if (!sheet) {
      return new Response(JSON.stringify({ error: 'Worksheet "Lead CRM" not found' }), { status: 400, headers: corsHeaders })
    }

    // Convert sheet to rows (header row assumed first row)
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null })

    const now = new Date().toISOString()
    const externalSource = 'website-outbound-crm'
    const results = {
      processed: 0,
      expected: {
        totalRows: 57,
        tier1: 20,
        tier2: 22,
        tier3: 15,
        ready: 53,
        research_needed: 4,
      },
      counts: {
        inserted: 0,
        updated: 0,
        skipped: 0,
        ambiguous: 0,
        failed: 0,
      },
      ambiguous_matches: [] as any[],
      failed_rows: [] as any[],
      tier_totals: { tier1: 0, tier2: 0, tier3: 0 },
      stage_totals: { ready: 0, research_needed: 0, other: 0 },
      preview: [] as any[],
    }

    // Preload existing engagements to make idempotent decisions by Lead ID external id stored in metadata.
    // We assume metadata has external lead id stored under metadata.website_outbound_crm.lead_id
    const { data: existingEngagements, error: engErr } = await supabaseAdmin
      .from('engagements')
      .select('id, brand_key, status, pipeline_stage, metadata, created_at, updated_at')
      .in('brand_key', ['truett-cash', 'authority-systems'])

    if (engErr) {
      return new Response(JSON.stringify({ error: engErr.message || String(engErr) }), { status: 500, headers: corsHeaders })
    }

    const existingByLeadId = new Map<string, any>()
    for (const e of existingEngagements || []) {
      const leadId = e?.metadata?.website_outbound_crm?.lead_id
      if (leadId) existingByLeadId.set(String(leadId), e)
    }

    // For matching organizations/contacts we do basic heuristics in dry-run: email/phone/company name+city.
    // To avoid heavy scans, we only fetch potentially matching rows by email/phone found in workbook.
    const allRawEmails = new Set<string>()
    const allRawPhones = new Set<string>()
    for (const r of rows) {
      const emailRaw = normalizeSpace(r['Email / Contact URL'])
      const email = extractPrimaryEmail(emailRaw)
      if (email) allRawEmails.add(email)
      const phone = normalizePhoneForMatch(normalizeSpace(r['Phone']))
      if (phone) allRawPhones.add(phone)
    }

    const emailsArr = [...allRawEmails].slice(0, 500)
    const phonesArr = [...allRawPhones].slice(0, 500)

    const { data: orgs, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .select('id, name, city, website, industry')
      .or(`website.ilike.%`)
      .limit(1)

    // The above placeholder avoids a full scan; real matching will be done per-row in SQL below using targeted queries.
    // We'll set orgs null here; matching per-row is safer for performance.

    const { data: contacts, error: cErr } = await supabaseAdmin
      .from('contacts')
      .select('id, organization_id, first_name, last_name, email, phone, job_title')
      .limit(1)

    void orgs
    void contacts
    void orgErr
    void cErr

    // Dry-run per row
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      results.processed++

      const leadIdRaw = normalizeSpace(r['Lead ID'])
      const tier = tierToInt(r['Tier'])
      const brandRoute = normalizeSpace(r['Brand Route'])
      const brandKey = toBrandKey(brandRoute)
      const companyName = normalizeSpace(r['Company'])
      const city = normalizeSpace(r['City'])
      const industry = normalizeSpace(r['Industry'])

      const phoneRaw = normalizeSpace(r['Phone'])
      const phoneNorm = normalizePhoneForMatch(phoneRaw)
      const phoneDisplay = guessPhoneDisplay(phoneRaw)

      const contactRaw = normalizeSpace(r['Email / Contact URL'])
      const email = extractPrimaryEmail(contactRaw)

      const statusLabel = normalizeSpace(r['Status'])
      const statusMapped = queueStageFromSpreadsheetStatus(statusLabel)

      // Tier totals
      if (tier === 1) results.tier_totals.tier1++
      if (tier === 2) results.tier_totals.tier2++
      if (tier === 3) results.tier_totals.tier3++

      const statusLower = statusLabel.toLowerCase()
      if (statusLower === 'ready') results.stage_totals.ready++
      else if (statusLower === 'research needed') results.stage_totals.research_needed++
      else results.stage_totals.other++

      if (!leadIdRaw) {
        results.counts.failed++
        results.failed_rows.push({ row: i + 2, error: 'Missing Lead ID', lead_id: leadIdRaw })
        continue
      }
      if (!tier || !brandKey) {
        results.counts.failed++
        results.failed_rows.push({ row: i + 2, error: 'Missing/invalid tier or brand', lead_id: leadIdRaw, tier, brandKey })
        continue
      }

      const fitNeed = parseMaybeNumber(r['Need 0–25'])
      const fitReach = parseMaybeNumber(r['Reachability 0–20'])
      const fitBuyer = parseMaybeNumber(r['Buyer Fit 0–20'])
      const fitNiche = parseMaybeNumber(r['Niche Fit 0–15'])
      const fitUpside = parseMaybeNumber(r['Upside 0–15'])
      const fitTiming = parseMaybeNumber(r['Timing 0–5'])

      const fitScore = computeFitScore(fitNeed, fitReach, fitBuyer, fitNiche, fitUpside, fitTiming)
      const observedGap = normalizeSpace(r['Observed Gap'])
      const personalizedPitch = normalizeSpace(r['Personalized Pitch'])
      const recommendedOffer = normalizeSpace(r['Recommended Offer'])

      const offerPrice = parseMaybeNumber(r['Offer Price'])
      const longTermValue = normalizeSpace(r['Long-Term Value'])

      const probability = parseMaybeNumber(r['Probability'])
      const weightedPipeline = offerPrice !== null && probability !== null ? offerPrice * probability : null

      // Determine existing engagement for idempotency
      const existing = existingByLeadId.get(leadIdRaw)

      // Determine duplicate detection for org/contact ambiguities: for now, in dry-run we query targeted matches.
      const matches: any[] = []

      if (email) {
        const { data: contactMatches, error: contactErr } = await supabaseAdmin
          .from('contacts')
          .select('id, organization_id, email, phone, first_name, last_name, job_title')
          .eq('email', email)
        if (contactErr) throw contactErr
        for (const cm of contactMatches || []) matches.push({ kind: 'contact_email', ...cm })
      }

      if (phoneNorm) {
        const { data: contactMatches, error: contactErr } = await supabaseAdmin
          .from('contacts')
          .select('id, organization_id, email, phone')
          .eq('phone', phoneNorm)
        if (contactErr) throw contactErr
        for (const cm of contactMatches || []) matches.push({ kind: 'contact_phone', ...cm })
      }

      if (companyName && city) {
        const { data: orgMatches, error: orgMatchErr } = await supabaseAdmin
          .from('organizations')
          .select('id, name, city, website')
          .eq('name', companyName)
          .eq('city', city)
        if (orgMatchErr) throw orgMatchErr
        for (const om of orgMatches || []) matches.push({ kind: 'org_name_city', ...om })
      }

      const ambiguous = matches.length > 1

      if (ambiguous) {
        results.counts.ambiguous++
        results.ambiguous_matches.push({ lead_id: leadIdRaw, brand_key: brandKey, tier, company: companyName, city, matches: matches.slice(0, 10) })
      }

      // Count inserted/updated/skipped based on existing engagement only (dry-run)
      if (existing) {
        // If existing engagement has newer updated_at or non-empty stage, we mark updated only if would fill missing fields.
        results.counts.updated++
      } else {
        results.counts.inserted++
      }

      results.preview.push({
        lead_id: leadIdRaw,
        brand_key: brandKey,
        tier,
        status_label: statusLabel,
        mapped_pipeline_stage: statusMapped,
        company_name: companyName,
        city,
        industry,
        email,
        phone_norm: phoneNorm,
        offer_price: offerPrice,
        probability,
        weighted_pipeline: weightedPipeline,
        observed_gap: observedGap,
        personalized_pitch: personalizedPitch,
        recommended_offer: recommendedOffer,
        fit_score_components: { need: fitNeed, reachability: fitReach, buyer_fit: fitBuyer, niche_fit: fitNiche, upside: fitUpside, timing: fitTiming },
        fit_score: fitScore,
        metadata_snapshot: {
          source: externalSource,
          source_file: 'Truett_Cash_Website_Outbound_CRM_2026-08-04',
          import_date: now,
        },
        would_create_event: true,
        deterministic_event_idempotency_key: `website-outbound-crm:${leadIdRaw}:prospect_imported`,
      })
    }

    // Totals check
    const tier1ok = results.tier_totals.tier1 === results.expected.tier1
    const tier2ok = results.tier_totals.tier2 === results.expected.tier2
    const tier3ok = results.tier_totals.tier3 === results.expected.tier3
    const readyOk = results.stage_totals.ready === results.expected.ready
    const rnOk = results.stage_totals.research_needed === results.expected.research_needed

    return new Response(
      JSON.stringify({
        ok: results.processed === results.expected.totalRows && tier1ok && tier2ok && tier3ok && readyOk && rnOk,
        dry_run: true,
        source_object: objectKey,
        results,
        checks: {
          processed_rows_match: results.processed,
          tier_totals_match: { tier1ok, tier2ok, tier3ok },
          status_totals_match: { readyOk, researchNeededOk: rnOk },
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}
