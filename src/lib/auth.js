import { supabase } from './supabase'

// Normalize a Supabase user into the shape the app already expects (uid/email/displayName).
function mapUser(u) {
  if (!u) return null
  return {
    uid: u.id,
    email: u.email,
    displayName: u.user_metadata?.name || u.user_metadata?.full_name || null,
  }
}

export function onAuthChange(callback) {
  if (!supabase) { callback(null); return () => {} }

  supabase.auth.getSession().then(({ data }) => {
    callback(mapUser(data.session?.user))
  })

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(mapUser(session?.user))
  })

  return () => sub.subscription.unsubscribe()
}

export async function signInWithEmail(email, password) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return { user: mapUser(data.user) }
}

export async function signUpWithEmail(email, password, displayName) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: displayName } },
  })
  if (error) throw error
  if (!data.session) {
    // Email confirmation is enabled on the project; no session yet.
    const e = new Error('Please confirm your email, then sign in.')
    e.code = 'auth/email-confirmation-required'
    throw e
  }
  return { user: mapUser(data.user) }
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
  return data
}

export async function resetPassword(email) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/login',
  })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}

export function readableAuthError(codeOrMessage) {
  const map = {
    'auth/email-confirmation-required': 'Please confirm your email, then sign in.',
    'Invalid login credentials': 'Invalid email or password.',
    'User already registered': 'An account already exists with this email.',
    'Email not confirmed': 'Please confirm your email before signing in.',
    'Password should be at least 6 characters': 'Password must be at least 6 characters.',
    'Unable to validate email address: invalid format': 'Invalid email address.',
  }
  return map[codeOrMessage] || codeOrMessage || 'An unexpected error occurred. Please try again.'
}
