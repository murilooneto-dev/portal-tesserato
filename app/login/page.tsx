import Image from 'next/image'
import LoginForm from '@/components/auth/LoginForm'

export const metadata = { title: 'Login — Tesserato' }

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image
            src="/logo.png"
            alt="Tesserato Contabilidade"
            width={96}
            height={96}
            className="rounded-xl"
            unoptimized
            priority
          />
          <div className="text-center">
            <p className="text-[var(--fg)] font-bold text-lg tracking-wide">Tesserato Contabilidade</p>
            <p className="text-[var(--fg)]/35 text-xs tracking-widest uppercase mt-0.5">Portal do Colaborador</p>
          </div>
        </div>

        <div className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
