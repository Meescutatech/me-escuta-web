"use client";

import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import { cn } from "@/lib/utils";
import { ChevronRightIcon, CheckIcon } from "lucide-react";

/**
 * `modal={false}` por padrão — o Base UI vem com `true`.
 *
 * **A razão é de comportamento, não de performance.** No modo modal o
 * `Menu.Root` monta um `InternalBackdrop` `fixed inset-0` que engole o primeiro
 * clique fora: para fechar este menu e abrir o vizinho eram dois cliques. Com
 * `false`, o clique fecha o menu E chega ao elemento de baixo — que é o que a
 * HIG › Popovers pede ("when possible, let people close one popover and open
 * another with a single click or tap").
 *
 * De quebra some o scroll-lock do documento, que o modo modal adquire a cada
 * abertura. Ele não protege nada aqui (o app não rola no `body`:
 * `routes/app/layout` é `h-svh` e o scroller é um `div` interno), mas o custo
 * dele é pequeno e depende da plataforma — **medido em 0,2–0,8 ms** no inbox
 * desta máquina, porque no macOS a scrollbar é sobreposta e o
 * `hasInsetScrollbars()` do Base UI devolve `false`, caindo no ramo barato. Em
 * Windows/Linux, com scrollbar embutida, o mesmo lock passa pelo ramo que lê
 * `offsetWidth` duas vezes entre escritas de estilo (dois relayouts síncronos do
 * documento) — é lá que a economia importa.
 *
 * **O que NÃO é:** isto não é o que fazia o menu parecer lento em `pnpm dev`.
 * Aquilo é a montagem a frio do popup em modo de desenvolvimento — medido em
 * 58–74 ms com uma long task de 68–82 ms, contra 15 ms e nenhuma long task na
 * build de produção. Ver o ADR 0102.
 *
 * Quem precisar do comportamento antigo passa `modal` explicitamente.
 */
function DropdownMenu({ modal = false, ...props }: MenuPrimitive.Root.Props) {
  return (
    <MenuPrimitive.Root data-slot="dropdown-menu" modal={modal} {...props} />
  );
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            // `w-max`, NÃO `w-[var(--anchor-width)]`. O menu dimensiona pelo próprio
            // conteúdo; a âncora é o BOTÃO que o abriu, e a maioria deles aqui é
            // um ícone de 28px — o menu ficava espremido no piso (`min-w-32`) e
            // os rótulos quebravam, enquanto o MESMO menu aberto por um gatilho
            // largo saía largo. Era daí que vinha "o popover tem tamanhos
            // diferentes em lugares diferentes". Dois arquivos já remendavam com
            // `min-w-max` no call site; o remendo saiu junto com a causa.
            //
            // `Select` continua em `w-[var(--anchor-width)]` de propósito: lá a lista
            // espelha o campo (HIG › Pop-up buttons), aqui não há campo.
            // `min-w-36` alinha com `context-menu` — o mesmo menu não pode ter
            // um piso por clique e outro por clique-direito.
            "z-50 max-h-[var(--available-height)] w-max min-w-36 origin-[var(--transform-origin)] overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[closed]:animate-out data-[closed]:overflow-hidden data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 motion-reduce:animate-none",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1 text-xs font-medium text-muted-foreground data-[inset]:pl-7.5",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Densidade do item: **texto de 13px (`text-ui-13`) numa linha de 28px**
 * (`min-h-7`).
 *
 * Os dois números respondem a coisas diferentes, e é por isso que não são o
 * mesmo. **13px é o TAMANHO DO TEXTO** — o padrão de macOS no HIG, e o que fez o
 * item sair de `text-sm` (14px), que era um passo grande demais para um menu.
 * **28px é o ALVO** — o "default" de ponteiro da tabela de tamanho de controle
 * da Apple (HIG › Accessibility › Mobility), folgado sobre o piso de 24px da
 * WCAG 2.5.8.
 *
 * A linha chegou a ser 22px (`py-0.5`), o que otimizava só a altura e cobrava o
 * preço no alvo e no ar: item de menu carrega ícone de 14px, e item de seletor
 * carrega bolinha de cor, avatar ou caixa de seleção — em 22px esses objetos
 * encostavam nas bordas.
 *
 * Vale para os quatro tipos de item (comum, submenu, checkbox, radio), para o
 * `context-menu` — que é o mesmo componente com outro gatilho, e densidade que
 * muda conforme se abre por clique ou por botão direito é o mesmo menu com dois
 * tamanhos — e para o `optionRowClass` do `option-combobox`, porque no HIG a
 * lista de um pop-up button É um menu.
 */
function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1 text-ui-13 outline-none select-none focus:bg-accent focus:text-accent-foreground [&:not([data-variant=destructive]):focus_*]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-7.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 data-[variant=destructive]:[&>svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1 text-ui-13 outline-none select-none focus:bg-accent focus:text-accent-foreground [&:not([data-variant=destructive]):focus_*]:text-accent-foreground data-[inset]:pl-7.5 data-[open]:bg-accent data-[open]:text-accent-foreground data-[popup-open]:bg-accent data-[popup-open]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      // Só o que DIFERE do menu de primeiro nível: uma sombra a mais, porque o
      // submenu se abre POR CIMA de um menu e precisa se destacar dele. Todo o
      // resto (largura, piso, raio, anel, duração, animação por lado) vem do
      // `DropdownMenuContent` — era reescrito aqui inteiro, com um
      // `min-w-[96px]` fora da escala, e por isso divergia a cada ajuste.
      // Mesma decisão do `ContextMenuSubContent`.
      className={cn("shadow-lg", className)}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex min-h-7 cursor-default items-center gap-2 rounded-md py-1 pr-7.5 pl-2 text-ui-13 outline-none select-none focus:bg-accent focus:text-accent-foreground focus:[&_*]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-7.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex min-h-7 cursor-default items-center gap-2 rounded-md py-1 pr-7.5 pl-2 text-ui-13 outline-none select-none focus:bg-accent focus:text-accent-foreground focus:[&_*]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-7.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
