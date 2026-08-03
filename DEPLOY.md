# Deploy — Portal Tesserato

## Variáveis de ambiente no Vercel

Acesse: Vercel → projeto → Settings → Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL        = https://<seu-projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   = eyJ...  (anon key do Supabase)
SUPABASE_SERVICE_ROLE_KEY       = eyJ...  (service role — NUNCA expor no client)
EMAIL_HOST                      = smtp.gmail.com
EMAIL_PORT                      = 587
EMAIL_USER                      = tesseratocontabilidade@gmail.com
EMAIL_PASS                      = <senha de app Gmail>
ADMIN_SESSION_SECRET            = <string aleatória, >= 32 bytes — ex.: openssl rand -base64 32>
```

`ADMIN_SESSION_SECRET` assina o cookie `ts_admin` da seção ADMIN (Parâmetros/Vínculos — feature TES-3). Configurar em Production **e** Preview; nunca versionar. Trocar o valor invalida todas as sessões ADMIN ativas (aceitável).

## Supabase — configurações necessárias

1. **Authentication → URL Configuration**
   - Site URL: `https://app.tesseratocontabilidade.com`
   - Redirect URLs: `https://app.tesseratocontabilidade.com/auth/reset-password`

2. **Authentication → Email Templates**
   - Personalizar o e-mail de reset de senha (opcional)

3. **Row Level Security (RLS)** — verificar que está ativo em todas as tabelas:
   - clientes, tarefas, profiles, parcelamentos, app_settings
   - Política sugerida para clientes: usuário só lê/escreve se `responsavel ilike nome do perfil` OR `role = admin`

## Domínio customizado no Vercel

1. Vercel → projeto → Settings → Domains → Add `app.tesseratocontabilidade.com`
2. No seu provedor DNS, adicionar registro CNAME:
   - Nome: `app`
   - Valor: `cname.vercel-dns.com`
3. Aguardar propagação (~10 min)

## Checklist antes de ir ao ar

- [ ] Variáveis de ambiente configuradas no Vercel
- [ ] `migration.sql` rodado no Supabase SQL Editor
- [ ] RLS ativo e políticas revisadas no Supabase
- [ ] Site URL configurado no Supabase Auth
- [ ] Domínio verificado no Vercel
- [ ] Testar login, reset de senha e acesso de não-admin
- [ ] `ADMIN_SESSION_SECRET` configurada (Production + Preview)
- [ ] Migration `019_admin_section_auth.sql` aplicada (cria `admin_users`, RPCs e a semente `ADMIN`)
- [ ] Testar seção ADMIN: acesso sem sessão → bloqueio; credencial semente → troca de senha obrigatória; credencial inválida → erro genérico; acesso direto por URL bloqueado; logout da área ADMIN
