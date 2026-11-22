import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/feed'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      const service = createServiceClient()
      
      // Check if user is already a member
      const { data: member } = await service
        .from('members')
        .select('*')
        .eq('auth_id', data.user.id)
        .single()
      
      if (member && member.signup_completed_at) {
        // Completed member - go to feed
        return NextResponse.redirect(`${origin}${next}`)
      }
      
      // Check if on waitlist
      const { data: waitlist } = await service
        .from('waitlist')
        .select('*')
        .eq('auth_id', data.user.id)
        .single()
      
      if (!waitlist) {
        // Add to waitlist
        await service.from('waitlist').insert({
          auth_id: data.user.id,
          email: data.user.email!,
          display_name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
          avatar_url: data.user.user_metadata?.avatar_url,
        })
      }
      
      // Send to waitlist page
      return NextResponse.redirect(`${origin}/waitlist`)
    }
  }

  // Error - redirect to login
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
