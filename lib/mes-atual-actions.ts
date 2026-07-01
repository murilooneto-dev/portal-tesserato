'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { MES_COOKIE } from './mes-atual'

export async function definirMesAno(mes: number, ano: number): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(MES_COOKIE, `${mes}-${ano}`, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    // sem maxAge/expires -> cookie de sessão, some ao fechar o navegador
  })
  revalidatePath('/fiscal', 'layout')
}
