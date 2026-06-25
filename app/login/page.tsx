import Image from 'next/image'
import LoginForm from '@/components/auth/LoginForm'

export const metadata = { title: 'Login — Tesserato' }

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image
            src="/logo.ico"
            alt="Tesserato Contabilidade"
            width={72}
            height={72}
            className="rounded-xl"
            priority
          />
          <div className="text-center">
            <p className="text-white font-bold text-lg tracking-wide">Tesserato Contabilidade</p>
            <p className="text-white/35 text-xs tracking-widest uppercase mt-0.5">Portal do Colaborador</p>
          </div>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
