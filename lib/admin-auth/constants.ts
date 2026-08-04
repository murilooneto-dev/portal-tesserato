// Parâmetros da sessão ADMIN (step-up) — centralizados aqui para poder
// ajustar sem refatoração quando o cliente confirmar DP2/DP4/DP5
// (ver ARCHITECTURE.md / SPEC.md da feature TES-3). Nenhum destes valores
// é hardcoded em session.ts/server.ts/proxy.ts — todos importam daqui.

// Nome do cookie assinado da seção ADMIN, separado do cookie do Supabase Auth.
export const ADMIN_SESSION_COOKIE = 'ts_admin'

// Nome da env com o segredo de assinatura do JWT (>= 32 bytes aleatórios,
// nunca versionado — configurar no Vercel, ver DEPLOY.md).
export const ADMIN_SESSION_SECRET_ENV = 'ADMIN_SESSION_SECRET'

// Expiração absoluta da sessão, contada a partir do login (claim `iat`,
// fixo entre renovações) — padrão proposto pela Arquitetura: 8h.
export const ADMIN_SESSION_ABSOLUTE_TTL_SECONDS = 8 * 60 * 60

// Janela de inatividade — a sessão é renovada (sliding) a cada acesso
// válido; se ficar mais que isto sem acesso, expira. Padrão proposto: 30 min.
export const ADMIN_SESSION_INACTIVITY_TTL_SECONDS = 30 * 60

// Política de força bruta (DP5): tentativas incorretas até bloquear e por
// quanto tempo. Mantido em sincronia com a RPC `admin_login`
// (supabase/migrations/019_admin_section_auth.sql) — se ajustar aqui,
// ajustar também na migration.
export const ADMIN_LOGIN_MAX_TENTATIVAS = 5
export const ADMIN_LOGIN_LOCKOUT_MINUTOS = 15

// Comprimento mínimo de senha exigido na troca obrigatória do primeiro
// acesso e em trocas futuras — regra de backend/segurança (o Design
// sugeriu 8 como recomendação de UX; aqui é a fonte de verdade, também
// aplicada na RPC `admin_trocar_senha`).
export const ADMIN_MIN_PASSWORD_LENGTH = 8
