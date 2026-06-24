import LoginForm from '@/components/auth/LoginForm'

export const metadata = { title: 'Login — Tesserato' }

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <svg width="56" height="56" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00c2e0"/>
                <stop offset="100%" stopColor="#0077b6"/>
              </linearGradient>
              <linearGradient id="lg2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1a3a8f"/>
                <stop offset="100%" stopColor="#0d2260"/>
              </linearGradient>
            </defs>
            <rect x="14" y="14" width="92" height="92" rx="16" fill="url(#lg1)" transform="rotate(45 60 60)"/>
            <rect x="24" y="24" width="72" height="72" rx="11" fill="url(#lg2)" transform="rotate(45 60 60)"/>
            <text x="60" y="57" textAnchor="middle" fill="#ffffff" fontSize="13.5" fontWeight="bold" fontFamily="Arial,sans-serif" letterSpacing="0.5">TESSERATO</text>
            <text x="60" y="70" textAnchor="middle" fill="#7dd8f0" fontSize="7.2" fontFamily="Arial,sans-serif" letterSpacing="1.5">CONTABILIDADE</text>
          </svg>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-8">
          <h1 className="text-xl font-bold text-white mb-1">Bem-vindo</h1>
          <p className="text-white/40 text-sm mb-6">Portal do Colaborador</p>
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
