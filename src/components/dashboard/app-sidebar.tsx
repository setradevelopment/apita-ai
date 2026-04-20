'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  DollarSign,
  CalendarDays,
  ChevronDown,
  Volleyball,
  LogOut,
  Trophy,
  Settings,
  Pencil,
  UserPlus,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { signOut } from '@/app/actions/auth'

// Itens "planos" do sidebar. "Gerenciador de Treinos" SAIU daqui porque
// virou um collapsible (igual Categorias) que lista cada categoria como
// sub-item — o coord escolhe a categoria pelo menu e cai direto no
// gerenciador daquela (/trainings?cat=ID). Sem mais abas horizontais.
//
// `memberRestricted: true` → item NÃO aparece pro atleta. Atleta só vê
// Dashboard + Financeiro (+ Categorias como submenu). Membros e afins
// ficam exclusivos de admin/coord/super_admin.
type NavGestaoItem = {
  title: string
  href: string
  icon: typeof LayoutDashboard
  memberRestricted?: boolean
}
const navGestao: NavGestaoItem[] = [
  { title: 'Dashboard',  href: '/dashboard',  icon: LayoutDashboard                            },
  { title: 'Membros',    href: '/members',    icon: Users,      memberRestricted: true         },
  { title: 'Financeiro', href: '/financials', icon: DollarSign                                 },
]

interface Category {
  id: string
  name: string
  logo_url?: string | null
}

interface AppSidebarProps {
  userName: string
  userRole: string
  categories: Category[]
  orgLogoUrl?: string | null
  /**
   * Quantos atletas estão com cadastro pendente de aprovação. Quando > 0,
   * renderiza o item "Pendentes (N)" no menu de Gestão, abaixo de Membros.
   * 0 ou undefined = item não aparece (requisito do owner: "não exibir
   * quando não tem ninguém pra aprovar").
   */
  pendingCount?: number
}

function roleLabel(role: string): string {
  switch (role) {
    case 'admin':
    case 'super_admin':
      return 'Administrador'
    case 'coordinator':
      return 'Coordenador'
    case 'member':
    default:
      return 'Atleta'
  }
}

export function AppSidebar({
  userName,
  userRole,
  categories,
  orgLogoUrl,
  pendingCount = 0,
}: AppSidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Categoria ativa na URL pra destacar o item correto no collapsible de
  // "Gerenciador de Treinos". Quando a rota é `/trainings?cat=X`, marca o
  // sub-item X como active.
  const activeTrainingCat = pathname === '/trainings' ? searchParams.get('cat') : null
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary/20 overflow-hidden">
            {orgLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={orgLogoUrl}
                alt="Logo da organização"
                className="h-full w-full object-contain"
              />
            ) : (
              <Trophy className="h-[18px] w-[18px] text-sidebar-primary" />
            )}
          </div>
          <div className="flex flex-col">
            <span
              className="text-[13px] font-bold text-sidebar-accent-foreground leading-none tracking-tight"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              Apita aí
            </span>
            <span className="text-[11px] text-sidebar-foreground/50 mt-0.5">Gestão Esportiva</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold px-3 mb-1">
            Gestão
          </SidebarGroupLabel>
          <SidebarMenu>
            {navGestao
              .filter((item) => !(item.memberRestricted && userRole === 'member'))
              .map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

            {/* Pendentes — só aparece quando há atletas aguardando aprovação.
                Badge âmbar à direita chama atenção sem ser alarmante (a cor
                destructive seria exagero pra "algo pra revisar"). Linka pra
                /members?tab=pending, que a aba abre direto nos pendentes. */}
            {pendingCount > 0 && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/members?tab=pending" />}
                  isActive={pathname === '/members'}
                  tooltip={`${pendingCount} cadastro(s) pendente(s) de aprovação`}
                >
                  <UserPlus />
                  <span>Pendentes</span>
                  <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {pendingCount}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {/* Gerenciador de Treinos — vira collapsible (igual Categorias)
                com as mesmas categorias como sub-itens. Cada item linka pra
                `/trainings?cat=ID` → o client filtra pela categoria sem as
                abas horizontais antigas.

                Atleta NÃO vê esse menu — ele não tem acesso ao gerenciador
                (quem marca presença/pagamento é coord/admin). O atleta
                acompanha seus pagamentos em /financials. */}
            {categories.length > 0 && userRole !== 'member' && (
              <Collapsible defaultOpen className="group/collapsible-trainings">
                <SidebarMenuItem>
                  <CollapsibleTrigger render={<SidebarMenuButton tooltip="Gerenciador de Treinos" />}>
                    <CalendarDays />
                    <span>Gerenciador de Treinos</span>
                    <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-50 transition-transform group-data-[state=open]/collapsible-trainings:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {categories.map((category) => (
                        <SidebarMenuSubItem key={category.id}>
                          <SidebarMenuSubButton
                            render={<Link href={`/trainings?cat=${category.id}`} />}
                            isActive={activeTrainingCat === category.id}
                          >
                            {category.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={category.logo_url}
                                alt=""
                                className="h-4 w-4 rounded object-cover shrink-0"
                              />
                            ) : (
                              <span
                                aria-hidden
                                className="h-4 w-4 rounded bg-sidebar-primary/20 text-sidebar-primary text-[9px] font-bold flex items-center justify-center shrink-0"
                              >
                                {category.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                            <span>{category.name}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            )}

            {categories.length > 0 && (
              <Collapsible defaultOpen className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger render={<SidebarMenuButton tooltip="Categorias" />}>
                    <Volleyball />
                    <span>Categorias</span>
                    <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-50 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {categories.map((category) => (
                        <SidebarMenuSubItem key={category.id}>
                          <SidebarMenuSubButton
                            render={<Link href={`/categories/${category.id}`} />}
                            isActive={pathname === `/categories/${category.id}`}
                          >
                            {/* Logo minúsculo (16x16) à esquerda — identidade
                                visual da categoria no menu. Fallback: chip
                                com a primeira inicial em gradient sutil. */}
                            {category.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={category.logo_url}
                                alt=""
                                className="h-4 w-4 rounded object-cover shrink-0"
                              />
                            ) : (
                              <span
                                aria-hidden
                                className="h-4 w-4 rounded bg-sidebar-primary/20 text-sidebar-primary text-[9px] font-bold flex items-center justify-center shrink-0"
                              >
                                {category.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                            <span>{category.name}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu>
          {/* Profile link with hover edit hint */}
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/profile" />}
              isActive={pathname === '/profile'}
              tooltip="Editar perfil"
              className="h-auto py-2.5 px-3"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/20 text-sidebar-primary">
                <span className="text-xs font-bold">{initials}</span>
              </div>
              <div className="flex flex-col text-left min-w-0 flex-1">
                <span className="text-xs font-semibold text-sidebar-accent-foreground truncate">
                  {userName}
                </span>
                <span className="text-[11px] text-sidebar-foreground/50">
                  {roleLabel(userRole)}
                </span>
              </div>
              <Pencil className="ml-auto h-3.5 w-3.5 text-sidebar-foreground/50 opacity-0 transition-opacity group-hover/menu-button:opacity-100 group-data-[active=true]/menu-button:opacity-100" />
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Settings — atleta NÃO vê. Toda configuração hoje é gerencial
              (categorias, posições, usuários, limites de plano). Quando/se
              houver preferências pessoais, revisitamos; por enquanto, esconder
              é mais honesto que mostrar um botão que cai em "Sem permissão". */}
          {userRole !== 'member' && (
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/settings" />}
                isActive={pathname === '/settings'}
                tooltip="Configurações"
              >
                <Settings />
                <span>Configurações</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {/* Sign out */}
          <SidebarMenuItem>
            <form action={signOut}>
              <SidebarMenuButton
                render={<button type="submit" className="w-full" />}
                tooltip="Sair"
              >
                <LogOut />
                <span>Sair</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
