import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export default async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = path === '/' || path.startsWith('/login') || path.startsWith('/signup')

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && (path.startsWith('/login') || (path.startsWith('/signup') && path !== '/signup/success'))) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ── Role-based routing for admin/dashboard ───────────────────────────────
  if (user && (path.startsWith('/admin') || path.startsWith('/dashboard'))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role ?? ''
    const isSuperAdmin = role === 'super_admin'

    // Block non-super_admin from /admin
    if (path.startsWith('/admin') && !isSuperAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Redirect super_admin away from /dashboard → /admin
    if (path.startsWith('/dashboard') && isSuperAdmin) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
