import {
  Home, Users, Wrench, LayoutGrid, Calendar, FileText, CreditCard, ListChecks, UserCheck,
  Building2, ArrowDownLeft, ArrowUpRight, CalendarClock, SlidersHorizontal, Link2, Settings, Trash2, Construction,
  type LucideIcon,
} from 'lucide-react'
import type { IconeMenu } from '@/lib/navegacao'

export const ICONE: Record<IconeMenu, LucideIcon> = {
  inicio: Home,
  cadastro: Users,
  ferramentas: Wrench,
  dashboard: LayoutGrid,
  clientes: Users,
  calendario: Calendar,
  relatorios: FileText,
  parcelamentos: CreditCard,
  preenchimento: ListChecks,
  'minhas-tarefas': UserCheck,
  procedimentos: Building2,
  recebimentos: ArrowDownLeft,
  'contas-a-pagar': CalendarClock,
  pagamentos: ArrowUpRight,
  configuracoes: SlidersHorizontal,
  vinculos: Link2,
  parametros: Settings,
  lixeira: Trash2,
  'em-construcao': Construction,
}
