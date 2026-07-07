export interface QuickLinkBody {
  company: string
  portal_name: string
  purpose: string
  how_to_use: string
  type: 'website' | 'mobile_app'
  url?: string | null
  android_app_url?: string | null
  ios_app_url?: string | null
}

export function validateQuickLink(body: Partial<QuickLinkBody>): string | null {
  if (!body.company?.trim()) return 'Company is required'
  if (!body.portal_name?.trim()) return 'Portal name is required'
  if (!body.purpose?.trim()) return 'Purpose is required'
  if (!body.how_to_use?.trim()) return 'How to Use is required'
  if (body.type !== 'website' && body.type !== 'mobile_app') return 'Type must be Website or Mobile App'
  if (body.type === 'website' && !body.url?.trim()) return 'URL is required for Website links'
  if (body.type === 'mobile_app' && !body.android_app_url?.trim() && !body.ios_app_url?.trim()) {
    return 'At least one of Android App URL or iOS App URL is required for Mobile App links'
  }
  return null
}

export function buildQuickLinkRow(body: QuickLinkBody) {
  return {
    company: body.company.trim(),
    portal_name: body.portal_name.trim(),
    purpose: body.purpose.trim(),
    how_to_use: body.how_to_use.trim(),
    type: body.type,
    url: body.type === 'website' ? body.url!.trim() : null,
    android_app_url: body.type === 'mobile_app' ? (body.android_app_url?.trim() || null) : null,
    ios_app_url: body.type === 'mobile_app' ? (body.ios_app_url?.trim() || null) : null,
  }
}
