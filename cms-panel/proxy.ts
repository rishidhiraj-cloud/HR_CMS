import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let proxyResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          proxyResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            proxyResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isProtected = request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/messages') ||
    request.nextUrl.pathname.startsWith('/employees')

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (request.nextUrl.pathname === '/' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return proxyResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
