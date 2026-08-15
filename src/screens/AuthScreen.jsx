import { useState } from "react";
import { CalendarRange, Loader2 } from "lucide-react";
import { auth } from "../hooks/useAuth";

export default function AuthScreen() {

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async () => {
    setBusy(true); setMsg(null);
    const { error } = mode === "login"
      ? await auth.signIn(email, password)
      : await auth.signUp(email, password, name);
    if (error) setMsg(error.message);
    else if (mode === "signup") setMsg("확인 메일을 보냈어요. 메일함을 확인해 주세요.");
    setBusy(false);
  };

  const input = "w-full rounded-xl bg-slate-100 px-4 py-3 text-[14px] font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500">
            <CalendarRange className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-slate-800">Jerry Planner</h1>
          <p className="mt-1 text-[13px] font-semibold text-slate-500">환영합니다</p>
          <p className="mt-2 text-[12px] text-slate-400">
            {mode === "login" ? "계정으로 로그인하세요" : "가족 구성원도 각자 계정으로 쓸 수 있어요"}
          </p>
        </div>

        <div className="space-y-3">
          {mode === "signup" && (
            <input className={input} placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <input className={input} type="email" placeholder="you@example.com" autoComplete="email"
                 value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={input} type="password" placeholder="비밀번호" autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>

        {msg && <p className="mt-3 text-center text-[12px] font-semibold text-rose-500">{msg}</p>}

        <button onClick={submit} disabled={busy || !email || !password}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-[13px] font-bold text-white disabled:opacity-40">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "login" ? "로그인" : "가입하기"}
        </button>

        <div className="my-4 text-center text-[11px] font-semibold text-slate-400">또는</div>

        <button onClick={auth.signInWithGoogle}
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-3 text-[13px] font-bold text-slate-700">
          Google로 계속하기
        </button>

        <p className="mt-6 text-center text-[12px] text-slate-400">
          {mode === "login" ? "계정이 없으신가요? " : "이미 계정이 있으신가요? "}
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(null); }}
                  className="font-bold text-blue-500">
            {mode === "login" ? "가입하기" : "로그인"}
          </button>
        </p>
      </div>
    </div>
  );
}
