import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: hr } = await supabase.from('hr_users').select('id').eq('id', user.id).single()
  if (!hr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = svc()

  const last30: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    last30.push(d.toISOString().slice(0, 10))
  }
  const thirtyDaysAgo = last30[0]

  const [
    { data: searchLogs },
    { data: docLogs },
    { data: documents },
    { data: allEmployees },
  ] = await Promise.all([
    admin.from('search_logs').select('user_id, query, created_at').order('created_at', { ascending: false }).limit(2000),
    admin.from('document_access_logs').select('employee_id, document_id, created_at').order('created_at', { ascending: false }),
    admin.from('policy_documents').select('id, name, file_type'),
    admin.from('employees').select('id, name, department'),
  ])

  const empMap = Object.fromEntries(
    (allEmployees ?? []).map(e => [e.id, { name: e.name, department: e.department as string | null }])
  )
  const docMap = Object.fromEntries(
    (documents ?? []).map(d => [d.id, { name: d.name, file_type: d.file_type as string }])
  )

  // ── Search aggregations ────────────────────────────────────────────
  const recentSearches = (searchLogs ?? []).filter(s => s.created_at >= thirtyDaysAgo)

  const dailySearchMap: Record<string, number> = Object.fromEntries(last30.map(d => [d, 0]))
  for (const s of recentSearches) {
    const day = s.created_at.slice(0, 10)
    if (day in dailySearchMap) dailySearchMap[day]++
  }

  const queryCounts: Record<string, number> = {}
  for (const s of recentSearches) {
    const key = s.query.trim().toLowerCase()
    queryCounts[key] = (queryCounts[key] ?? 0) + 1
  }
  const topQueries = Object.entries(queryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([query, count]) => ({ query, count }))

  const dailySearches = last30.map(date => ({ date, count: dailySearchMap[date] }))
  const peakEntry = dailySearches.reduce((best, d) => d.count > best.count ? d : best, { date: '', count: 0 })

  // Search details with employee info (all-time)
  const searchDetails = (searchLogs ?? []).map(s => ({
    employee_name: empMap[s.user_id]?.name ?? 'Unknown',
    department: empMap[s.user_id]?.department ?? null,
    query: s.query,
    created_at: s.created_at,
  }))

  const searchStats = {
    total30d: recentSearches.length,
    totalAllTime: (searchLogs ?? []).length,
    uniqueQueries30d: Object.keys(queryCounts).length,
    peakDay: peakEntry.date,
    peakCount: peakEntry.count,
    dailySearches,
    topQueries,
  }

  // ── Document aggregations ──────────────────────────────────────────
  const recentDocLogs = (docLogs ?? []).filter(l => l.created_at >= thirtyDaysAgo)

  const dailyDocMap: Record<string, number> = Object.fromEntries(last30.map(d => [d, 0]))
  for (const l of recentDocLogs) {
    const day = l.created_at.slice(0, 10)
    if (day in dailyDocMap) dailyDocMap[day]++
  }

  const docCountMap: Record<string, number> = {}
  for (const log of (docLogs ?? [])) {
    docCountMap[log.document_id] = (docCountMap[log.document_id] ?? 0) + 1
  }
  const topDocuments = Object.entries(docCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({ id, name: docMap[id]?.name ?? 'Unknown', file_type: docMap[id]?.file_type ?? '', count }))

  const dailyDocOpens = last30.map(date => ({ date, count: dailyDocMap[date] }))
  const peakDocEntry = dailyDocOpens.reduce((best, d) => d.count > best.count ? d : best, { date: '', count: 0 })

  // Doc details with employee info (all-time)
  const docDetails = (docLogs ?? []).map(l => ({
    employee_name: empMap[l.employee_id]?.name ?? 'Unknown',
    department: empMap[l.employee_id]?.department ?? null,
    document_id: l.document_id,
    document_name: docMap[l.document_id]?.name ?? 'Unknown',
    file_type: docMap[l.document_id]?.file_type ?? '',
    created_at: l.created_at,
  }))

  const docStats = {
    total30d: recentDocLogs.length,
    totalAllTime: (docLogs ?? []).length,
    uniqueDocs: Object.keys(docCountMap).length,
    peakDay: peakDocEntry.date,
    peakCount: peakDocEntry.count,
    dailyDocOpens,
    topDocuments,
  }

  return NextResponse.json({ searchStats, docStats, searchDetails, docDetails })
}
