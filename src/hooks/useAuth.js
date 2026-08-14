import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * 인증 액션은 상태를 갖지 않으므로 훅 밖에 둔다.
 * (훅 안에 두면 AuthScreen 처럼 액션만 필요한 곳에서도
 *  세션 구독이 하나 더 생겨 리스너가 중복된다)
 */
export const auth = {
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  signUp: (email, password, displayName) =>
    supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    }),
  signInWithGoogle: () =>
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    }),
  signOut: () => supabase.auth.signOut(),
};

/** 세션 구독은 앱 최상단에서 한 번만 사용한다. */
export function useSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}
