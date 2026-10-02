import LoginForm from '@/components/auth/LoginForm'
import { TelaAcesso } from '@/components/auth/TelaAcesso'

export const metadata = { title: 'Entrar — Tesserato' }

export default function LoginPage() {
  return (
    <TelaAcesso>
      <LoginForm />
    </TelaAcesso>
  )
}
