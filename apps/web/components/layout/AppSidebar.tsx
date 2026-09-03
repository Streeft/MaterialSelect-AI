"use client";

import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { Badge, IconButton, ThemeToggle } from "@/components/ui";
import { useFocusTrap } from "@/components/ui/focusTrap";
import {
  IconBook,
  IconClose,
  IconCompare,
  IconFilter,
  IconGauge,
  IconHome,
  IconLayers,
  IconLogout,
  IconMenu,
  IconPanelLeft,
  IconRuler,
  IconScatter,
  IconUpload,
} from "@/components/ui/icons";

const t = ptBR.nav;

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const HOME: NavItem = { href: "/", label: t.home, icon: IconHome };

/**
 * Três grupos, na ordem em que o trabalho acontece: você estuda algo, o estudo
 * precisa de dados, e alguém mantém o vocabulário em que esses dados são
 * escritos.
 *
 * Todo destino carrega um glifo, do qual o cabeçalho anterior não precisava e
 * este precisa: um rail que colapsa para 68 px não tem espaço para palavras, e
 * o ícone passa a ser o rótulo. Cada um desenha o que a tela *faz* — um funil
 * para o funil de seleção, pontos plotados para o mapa de propriedades — em vez
 * de um documento genérico que faria os oito parecerem iguais a 18 px.
 */
const GROUPS: NavGroup[] = [
  {
    id: "study",
    label: t.groupStudy,
    items: [
      { href: "/selecao", label: t.selection, icon: IconFilter },
      { href: "/mapas", label: t.maps, icon: IconScatter },
      { href: "/comparar", label: t.compare, icon: IconCompare },
    ],
  },
  {
    id: "data",
    label: t.groupData,
    items: [
      { href: "/catalogo", label: t.catalog, icon: IconBook },
      { href: "/painel", label: t.dashboard, icon: IconGauge },
      { href: "/importar", label: t.imports, icon: IconUpload },
    ],
  },
  {
    id: "admin",
    label: t.groupAdmin,
    items: [
      { href: "/admin/classes", label: t.classes, icon: IconLayers },
      { href: "/admin/propriedades", label: t.properties, icon: IconRuler },
    ],
  },
];

/** `/` só casa consigo mesma; toda outra rota também manda no que está abaixo dela. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Um destino.
 *
 * O rail é escuro nos dois temas (ver os tokens `--rail-*` em globals.css): é o
 * que o mantém como moldura em vez de mais um painel, e é contra ele que o
 * matiz da seção acende. O item ativo diz "você está aqui" três vezes, e cada
 * uma cobre uma falha da outra: o indicador de 3 px na borda esquerda sobrevive
 * ao rail colapsado, o preenchimento sobrevive a um relance, e `aria-current`
 * sobrevive a não haver cor nenhuma.
 *
 * O indicador é um filho posicionado, não uma `border-left`: uma borda
 * empurraria o conteúdo 3 px para dentro apenas no item ativo, e a fileira de
 * ícones deixaria de se alinhar.
 *
 * O rótulo nunca é removido quando o rail colapsa, apenas vira `sr-only`. Um
 * link cujo texto desaparece é um link sem nome acessível; um link cujo texto
 * só não é pintado continua se anunciando, e ganha um tooltip nativo para quem
 * vê mas não adivinha o glifo.
 */
function NavLink({
  item,
  active,
  collapsed = false,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      // A página atual é anunciada, não só pintada: cor sozinha deixa quem usa
      // leitor de tela sem ideia de onde está.
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-control py-2 text-sm transition",
        "origin-left hover:scale-[1.02] active:scale-[0.98]",
        collapsed ? "justify-center px-2" : "px-3",
        active
          ? "bg-rail-accent/20 font-semibold text-rail-ink"
          : "text-rail-ink-muted hover:bg-rail-edge/[0.07] hover:text-rail-ink",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="animate-grow-y absolute inset-y-2 left-0 w-[3px] rounded-full bg-rail-accent"
        />
      ) : null}
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110",
          active ? "scale-105 text-rail-accent" : "text-rail-ink-subtle",
        )}
      />
      <span className={cn(collapsed && "sr-only")}>{item.label}</span>
    </Link>
  );
}

/** Um grupo titulado de destinos. */
function NavGroupList({
  group,
  pathname,
  idPrefix,
  collapsed = false,
}: {
  group: NavGroup;
  pathname: string;
  idPrefix: string;
  collapsed?: boolean;
}) {
  const labelId = `${idPrefix}-${group.id}`;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        id={labelId}
        className={cn(
          "px-3 pb-1 font-mono text-2xs uppercase tracking-eyebrow text-rail-ink-subtle",
          collapsed && "sr-only",
        )}
      >
        {group.label}
      </span>
      <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <li key={item.href}>
            <NavLink item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A marca, que também é o link para casa. */
function BrandLink({ pathname, collapsed = false }: { pathname: string; collapsed?: boolean }) {
  return (
    <Link
      href="/"
      aria-current={pathname === "/" ? "page" : undefined}
      title={collapsed ? ptBR.appName : undefined}
      className="group flex items-center gap-2 rounded-control px-1 py-1"
    >
      {/* Um squircle que arredonda mais sob o ponteiro. Decorativo — o nome ao
          lado é o acessível, e permanece na árvore mesmo quando o rail está
          estreito demais para pintá-lo. */}
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[0.7rem] bg-brand text-sm font-bold text-brand-fg transition-all group-hover:scale-105 group-hover:rounded-[1.1rem]"
      >
        M
      </span>
      <span className={cn("font-semibold text-rail-ink", collapsed && "sr-only")}>
        {ptBR.appName}
      </span>
    </Link>
  );
}

/**
 * Quem está autenticado, e a única saída.
 *
 * Não renderiza nada enquanto `/auth/me` resolve ou quando não há usuário — o
 * `AuthGate` do layout já cobre essa espera, então este rodapé só precisa cobrir
 * o caso em que um usuário está carregado.
 */
function UserFooter({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) return null;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      queryClient.setQueryData(["me"], undefined);
      router.replace("/entrar");
    }
  }

  return (
    <div className={cn("flex items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
      <div
        className={cn("flex min-w-0 items-center gap-2", collapsed && "flex-col")}
        title={collapsed ? user.name : undefined}
      >
        {user.avatar_url ? (
          // URL de avatar de terceiro, não um asset local que o next/image possa
          // otimizar.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rail-accent/25 text-xs font-semibold text-rail-accent"
          >
            {user.name.charAt(0).toUpperCase()}
          </span>
        )}
        {!collapsed && (
          <span className="truncate text-xs font-medium text-rail-ink-muted">{user.name}</span>
        )}
      </div>
      <IconButton
        size="sm"
        label={ptBR.auth.logout}
        icon={<IconLogout />}
        onClick={handleLogout}
        disabled={loggingOut}
      />
    </div>
  );
}

/**
 * A navegação da aplicação: um rail permanente de `lg` para cima, uma gaveta
 * modal abaixo disso.
 *
 * Substitui um cabeçalho superior cujos oito links só caíam a partir de 1280 px
 * e eram uma fileira horizontal que não dizia nada sobre quais telas pertencem
 * umas às outras. O rail compra as duas coisas que aquela fileira não podia ter:
 * o agrupamento fica visível enquanto se trabalha, e a largura é sua — colapse
 * para glifos quando o mapa na tela importa mais do que o menu.
 *
 * O estado colapsado é estado do React e deliberadamente **não** persistido.
 * Sobrevive a toda navegação no cliente, porque este componente vive no layout
 * raiz e nunca desmonta; volta ao normal num reload. Persistir significaria ler
 * `localStorage` durante a renderização — o que discorda da marcação do
 * servidor e faz o React reclamar — ou fechar o rail com animação depois da
 * primeira pintura, que é pior do que começar aberto.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, panelRef, () => setOpen(false));

  // Uma gaveta que sobrevive à navegação que ela mesma causou cobriria a página
  // que o leitor pediu.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const collapseLabel = collapsed ? ptBR.ui.expandSidebar : ptBR.ui.collapseSidebar;

  return (
    <>
      {/* Telas estreitas: uma barra fina que carrega só o caminho para a gaveta.
          O controle de tema não é duplicado aqui — ele vive dentro da gaveta, ao
          lado de todo o resto que é chrome de navegação. */}
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-rail px-3 py-2 lg:hidden">
        {/* O rótulo não muda para "fechar": enquanto a gaveta está aberta este
            botão fica atrás do overlay, e a gaveta carrega o próprio controle de
            fechar. Dois botões com o mesmo nome e a mesma função são um labirinto
            para quem lê por nome. O estado está em `aria-expanded`. */}
        <IconButton
          size="sm"
          label={ptBR.ui.openMenu}
          icon={<IconMenu />}
          aria-expanded={open}
          aria-controls="menu-principal"
          onClick={() => setOpen(true)}
        />
        <BrandLink pathname={pathname} />
        <Badge tone="warning" className="ml-auto hidden sm:inline-flex">
          {ptBR.demoBadge}
        </Badge>
      </header>

      {/* Telas largas: o rail. `sticky` com `h-screen` o mantém no lugar
          enquanto a coluna de conteúdo rola por baixo. */}
      <aside
        id="navegacao-lateral"
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col gap-5 bg-rail px-3 py-4 transition-[width] ease-emphasized duration-slow lg:flex",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <div className={cn("flex flex-col gap-2", collapsed && "items-center")}>
          <BrandLink pathname={pathname} collapsed={collapsed} />
          {!collapsed && (
            <Badge tone="warning" className="self-start">
              {ptBR.demoBadge}
            </Badge>
          )}
        </div>

        <nav
          aria-label={ptBR.ui.mainNav}
          className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain"
        >
          <ul className="flex flex-col gap-0.5">
            <li>
              <NavLink item={HOME} active={isActive(pathname, "/")} collapsed={collapsed} />
            </li>
          </ul>
          {GROUPS.map((group) => (
            <NavGroupList
              key={group.id}
              group={group}
              pathname={pathname}
              idPrefix="nav-rail"
              collapsed={collapsed}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t border-rail-edge/10 pt-3">
          <UserFooter collapsed={collapsed} />
          <div
            className={cn(
              "flex items-center gap-2",
              collapsed ? "flex-col" : "justify-between",
            )}
          >
            {!collapsed && <ThemeToggle compact />}
            <IconButton
              size="sm"
              label={collapseLabel}
              title={collapseLabel}
              icon={<IconPanelLeft className={cn("transition-transform", collapsed && "rotate-180")} />}
              aria-expanded={!collapsed}
              aria-controls="navegacao-lateral"
              onClick={() => setCollapsed((value) => !value)}
            />
          </div>
        </div>
      </aside>

      {/* A gaveta é renderizada só enquanto aberta — uma cópia escondida de cada
          link dobraria as paradas de tabulação em toda página. */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-rail/70"
          />
          <div
            id="menu-principal"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ptBR.ui.mainNav}
            tabIndex={-1}
            className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col gap-5 overflow-y-auto bg-rail p-4 shadow-overlay"
          >
            <div className="flex items-center justify-between gap-2">
              <BrandLink pathname={pathname} />
              <IconButton
                size="sm"
                label={ptBR.ui.closeMenu}
                icon={<IconClose />}
                onClick={() => setOpen(false)}
              />
            </div>
            <nav className="flex flex-1 flex-col gap-5">
              <ul className="flex flex-col gap-0.5">
                <li>
                  <NavLink item={HOME} active={isActive(pathname, "/")} />
                </li>
              </ul>
              {GROUPS.map((group) => (
                <NavGroupList
                  key={group.id}
                  group={group}
                  pathname={pathname}
                  idPrefix="nav-drawer"
                />
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-2 border-t border-rail-edge/10 pt-3">
              <UserFooter />
              <ThemeToggle compact />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
