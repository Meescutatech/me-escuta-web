"use client";

import * as React from "react";
import {
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  InboxIcon,
  KanbanIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TrashIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";

import { Marca } from "@/components/ui/marca";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
import { FormItemLayout } from "@/components/ui/form-item-layout";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertDialogModal } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { PageContainer } from "@/components/ui/page-container";
import {
  PageHeader,
  PageHeaderAside,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderRow,
  PageHeaderSummary,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import {
  PageSection,
  PageSectionContent,
  PageSectionDescription,
  PageSectionHeader,
  PageSectionMeta,
  PageSectionSummary,
  PageSectionTitle,
} from "@/components/ui/page-section";
import { EmptyStatePresentational } from "@/components/ui/empty-state";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarWithStatus } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster, toast } from "@/components/ui/sonner";
import { AudioPlayer } from "@/components/ui/audio-player";
import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from "@/components/ui/alert";
import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Galeria do preset (10/09/2026). Cada bloco mostra UM componente de components/ui com exemplo
 * em PT-BR e dado da Me Escuta (pacientes, fonos, funil). Nao le banco nenhum.
 *
 * O botao de tema so troca a classe `.dark` no <html> desta aba — o app continua declarado claro.
 */

const PACIENTES = [
  { nome: "Maria das Dores", cidade: "Belo Horizonte", etapa: "Triagem", fono: "Sara", situacao: "agora" },
  { nome: "Jose Aparecido", cidade: "Contagem", etapa: "Exame agendado", fono: "Sara", situacao: "hoje" },
  { nome: "Antonia Ribeiro", cidade: "Betim", etapa: "Proposta", fono: "Priscila", situacao: "na_semana" },
  { nome: "Sebastiao Lima", cidade: "Juiz de Fora", etapa: "Aguardando credito", fono: "Levindo", situacao: "sem_pressa" },
  { nome: "Francisca Nunes", cidade: "Uberlandia", etapa: "Venda", fono: "Sara", situacao: "sem_pressa" },
] as const;

const SITUACAO: Record<string, { rotulo: string; variant: "destructive" | "warning" | "info" | "muted" }> = {
  agora: { rotulo: "Agora", variant: "destructive" },
  hoje: { rotulo: "Hoje", variant: "warning" },
  na_semana: { rotulo: "Na semana", variant: "info" },
  sem_pressa: { rotulo: "Sem pressa", variant: "muted" },
};

function Bloco({ id, titulo, nota, children }: { id: string; titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-h3 font-semibold">{titulo}</h2>
        {nota ? <p className="text-ui-12 text-muted-foreground">{nota}</p> : null}
      </div>
      <Card>
        <CardContent className="space-y-6">{children}</CardContent>
      </Card>
    </section>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-start">
      <span className="text-ui-12 font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const INDICE = [
  ["botoes", "Botoes"],
  ["campos", "Campos"],
  ["sobreposicoes", "Sheet · Dialog · Alert"],
  ["tabs", "Tabs"],
  ["tabela", "Tabela"],
  ["pagina", "Sidebar + Pagina"],
  ["vazio", "Estado vazio"],
  ["identidade", "Badge · Avatar · Skeleton"],
  ["flutuantes", "Tooltip · Hover · Menu"],
  ["feedback", "Toast · Alert · Progresso"],
  ["audio", "Audio"],
  ["tokens", "Tokens"],
] as const;

export function Galeria() {
  const [escuro, setEscuro] = React.useState(false);
  const [confirmar, setConfirmar] = React.useState(false);
  const [telefone, setTelefone] = React.useState<string | undefined>("+5531999998888");
  const [ligado, setLigado] = React.useState(true);
  const [carregando, setCarregando] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", escuro);
    return () => document.documentElement.classList.remove("dark");
  }, [escuro]);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
            <div className="flex items-center gap-4">
              <Marca />
              <Separator orientation="vertical" className="h-6" />
              <div>
                <p className="text-ui-13 font-semibold">Preset de design · LiderHub → Me Escuta</p>
                <p className="text-ui-11 text-muted-foreground">
                  53 componentes shadcn (base-nova) sobre @base-ui/react · tokens OKLCH · Tailwind 3 com ponte
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" size="xs">
                branch design/preset-liderhub
              </Badge>
              <Button variant="outline" size="sm" onClick={() => setEscuro((v) => !v)}>
                {escuro ? <SunIcon /> : <MoonIcon />}
                {escuro ? "Tema claro" : "Tema escuro"}
              </Button>
            </div>
          </div>
          <nav className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-6 pb-2 text-ui-12 text-muted-foreground">
            {INDICE.map(([id, rotulo]) => (
              <a key={id} href={`#${id}`} className="hover:text-foreground">
                {rotulo}
              </a>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-6xl space-y-10 px-6 py-8">
          <Bloco id="botoes" titulo="Botoes" nota="primary = laranja (unico acento de acao, r9)">
            <Linha rotulo="variantes">
              <Button>Salvar</Button>
              <Button variant="secondary">Secundario</Button>
              <Button variant="outline">Contorno</Button>
              <Button variant="ghost">Fantasma</Button>
              <Button variant="destructive">Excluir</Button>
              <Button variant="success">Atender</Button>
              <Button variant="link">Ver conversa</Button>
            </Linha>
            <Linha rotulo="tamanhos">
              <Button size="xs">Extra pequeno</Button>
              <Button size="sm">Pequeno</Button>
              <Button>Padrao</Button>
              <Button size="lg">Grande</Button>
              <Button size="icon" aria-label="Adicionar">
                <PlusIcon />
              </Button>
              <Button size="icon-sm" variant="outline" aria-label="Mais">
                <MoreHorizontalIcon />
              </Button>
            </Linha>
            <Linha rotulo="estados">
              <Button disabled>Desabilitado</Button>
              <Button loading={carregando} onClick={() => { setCarregando(true); setTimeout(() => setCarregando(false), 1500); }}>
                {carregando ? "Enviando" : "Enviar mensagem"}
              </Button>
              <Button variant="outline">
                <UserPlusIcon data-icon="inline-start" />
                Convidar fono
              </Button>
            </Linha>
          </Bloco>

          <Bloco id="campos" titulo="Campos de formulario" nota="form-item-layout + hint-tooltip + phone-input">
            <div className="grid gap-6 md:grid-cols-2">
              <FormItemLayout label="Nome da paciente" required description="Como aparece na ficha e no WhatsApp.">
                <Input placeholder="Maria das Dores" />
              </FormItemLayout>
              <FormItemLayout label="Telefone" description="DDI + DDD; o numero vira E.164 ao salvar.">
                <PhoneInput value={telefone} onChange={setTelefone} defaultCountry="BR" />
              </FormItemLayout>
              <FormItemLayout label="Etapa do funil">
                <Select defaultValue="triagem">
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="novo">Novo lead</SelectItem>
                    <SelectItem value="triagem">Triagem</SelectItem>
                    <SelectItem value="exame">Exame agendado</SelectItem>
                    <SelectItem value="proposta">Proposta</SelectItem>
                    <SelectItem value="venda">Venda</SelectItem>
                  </SelectContent>
                </Select>
              </FormItemLayout>
              <FormItemLayout label="E-mail" error="Formato invalido — falta o @.">
                <Input defaultValue="maria.dores" aria-invalid />
              </FormItemLayout>
              <FormItemLayout label="Observacao da triagem" description="Nao vai para a paciente." className="md:col-span-2">
                <Textarea placeholder="Perda auditiva bilateral, usa aparelho ha 3 anos, quer trocar." rows={3} />
              </FormItemLayout>
            </div>
            <Separator />
            <Linha rotulo="switch">
              <div className="flex items-center gap-2">
                <Switch checked={ligado} onCheckedChange={setLigado} id="clara" />
                <Label htmlFor="clara">Clara responde sozinha {ligado ? "(ligada)" : "(desligada)"}</Label>
                <HintTooltip content="Autonomia e configuracao do agente, nao deploy. Credito e preco nunca sao automaticos.">
                  <span className="text-ui-12 text-muted-foreground underline decoration-dotted">por que?</span>
                </HintTooltip>
              </div>
            </Linha>
            <Linha rotulo="checkbox">
              <div className="flex items-center gap-2">
                <Checkbox id="lgpd" defaultChecked />
                <Label htmlFor="lgpd">Paciente aceitou o termo LGPD</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="hsm" />
                <Label htmlFor="hsm">Enviar HSM de lembrete</Label>
              </div>
            </Linha>
            <Linha rotulo="radio">
              <RadioGroup defaultValue="whatsapp" className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="whatsapp" id="c1" />
                  <Label htmlFor="c1">WhatsApp</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="ligacao" id="c2" />
                  <Label htmlFor="c2">Ligacao</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="presencial" id="c3" />
                  <Label htmlFor="c3">Presencial</Label>
                </div>
              </RadioGroup>
            </Linha>
            <Linha rotulo="toggle-group">
              <ToggleGroup defaultValue={["mensagem"]}>
                <ToggleGroupItem value="mensagem">Mensagem</ToggleGroupItem>
                <ToggleGroupItem value="nota">Nota</ToggleGroupItem>
                <ToggleGroupItem value="tarefa">Tarefa</ToggleGroupItem>
              </ToggleGroup>
            </Linha>
          </Bloco>

          <Bloco id="sobreposicoes" titulo="Sheet · Dialog · Alert dialog">
            <Linha rotulo="abrir">
              <Sheet>
                <SheetTrigger render={<Button variant="outline">Sheet: editar membro</Button>} />
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Editar membro</SheetTitle>
                    <SheetDescription>Sara Oliveira · fonoaudiologa · Pre-venda</SheetDescription>
                  </SheetHeader>
                  <SheetBody className="space-y-4">
                    <FormItemLayout label="Nome">
                      <Input defaultValue="Sara Oliveira" />
                    </FormItemLayout>
                    <FormItemLayout label="Papel">
                      <Select defaultValue="membro">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="membro">Membro</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="owner">Dono</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItemLayout>
                  </SheetBody>
                  <SheetFooter>
                    <Button variant="outline">Cancelar</Button>
                    <Button>Salvar alteracoes</Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              <Dialog>
                <DialogTrigger render={<Button variant="outline">Dialog: convidar</Button>} />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Convidar para a equipe</DialogTitle>
                    <DialogDescription>A pessoa recebe um link por e-mail e escolhe a senha.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <FormItemLayout label="E-mail" required>
                      <Input placeholder="fono@meescuta.com" type="email" />
                    </FormItemLayout>
                    <FormItemLayout label="Departamento">
                      <Select defaultValue="pre_venda">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pre_venda">Pre-venda</SelectItem>
                          <SelectItem value="pos_venda">Pos-venda</SelectItem>
                          <SelectItem value="credito">Credito</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItemLayout>
                  </div>
                  <DialogFooter>
                    <Button variant="outline">Cancelar</Button>
                    <Button onClick={() => toast.success("Convite enviado", { description: "fono@meescuta.com" })}>
                      Enviar convite
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button variant="destructive" onClick={() => setConfirmar(true)}>
                <TrashIcon data-icon="inline-start" />
                Alert: desconectar canal
              </Button>
              <AlertDialogModal
                open={confirmar}
                onOpenChange={setConfirmar}
                title="Desconectar o numero da Sara?"
                description="As conversas ficam no historico. Mensagens novas deixam de entrar ate parear de novo."
                confirmLabel="Desconectar"
                confirmVariant="destructive"
                onConfirm={async () => {
                  await new Promise((r) => setTimeout(r, 600));
                  toast("Canal desconectado", { description: "lite:sara · +55 31 9999-8888" });
                }}
              />
            </Linha>
          </Bloco>

          <Bloco id="tabs" titulo="Tabs" nota="variantes default (pilula) e line (sublinhado)">
            <Tabs defaultValue="contexto">
              <TabsList>
                <TabsTrigger value="contexto">Contexto</TabsTrigger>
                <TabsTrigger value="negocios">Negocios</TabsTrigger>
                <TabsTrigger value="historico">Historico</TabsTrigger>
                <TabsTrigger value="midias">Midias</TabsTrigger>
              </TabsList>
              <TabsContent value="contexto" className="pt-3 text-ui-13 text-muted-foreground">
                Painel de dados ao lado da conversa — o que a fono precisa saber antes de responder.
              </TabsContent>
              <TabsContent value="negocios" className="pt-3 text-ui-13 text-muted-foreground">
                Propostas abertas, valor, modalidade de credito.
              </TabsContent>
              <TabsContent value="historico" className="pt-3 text-ui-13 text-muted-foreground">
                Eventos do ledger em ordem cronologica.
              </TabsContent>
              <TabsContent value="midias" className="pt-3 text-ui-13 text-muted-foreground">
                Audiometrias, fotos, documentos.
              </TabsContent>
            </Tabs>
            <Tabs defaultValue="geral">
              <TabsList variant="line">
                <TabsTrigger value="geral">Visao geral</TabsTrigger>
                <TabsTrigger value="equipe">Equipe</TabsTrigger>
                <TabsTrigger value="canais">Canais</TabsTrigger>
              </TabsList>
              <TabsContent value="geral" className="pt-3 text-ui-13 text-muted-foreground">
                Relatorio do dono: leads, CPL, conversao por origem.
              </TabsContent>
              <TabsContent value="equipe" className="pt-3 text-ui-13 text-muted-foreground">
                Tempo de primeira resposta por fono.
              </TabsContent>
              <TabsContent value="canais" className="pt-3 text-ui-13 text-muted-foreground">
                Oficial × Lite, por numero.
              </TabsContent>
            </Tabs>
          </Bloco>

          <Bloco id="tabela" titulo="Tabela" nota="5 linhas · badge por faixa de prioridade (D55)">
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Responsavel</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PACIENTES.map((p) => {
                    const s = SITUACAO[p.situacao];
                    return (
                      <TableRow key={p.nome}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Avatar size="xs">
                              <AvatarFallback>{p.nome.slice(0, 1)}</AvatarFallback>
                            </Avatar>
                            {p.nome}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.cidade}</TableCell>
                        <TableCell>{p.etapa}</TableCell>
                        <TableCell>{p.fono}</TableCell>
                        <TableCell>
                          <Badge variant={s.variant}>{s.rotulo}</Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Acoes" />}>
                              <MoreHorizontalIcon />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>Abrir conversa</DropdownMenuItem>
                              <DropdownMenuItem>Criar tarefa</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive">Arquivar</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Bloco>

          <Bloco id="pagina" titulo="Sidebar + page-header + page-section" nota="o shell de pagina do LiderHub, em miniatura">
            <div className="relative h-[520px] overflow-hidden rounded-xl border border-border bg-background [transform:translateZ(0)]">
              <SidebarProvider defaultMode="pinned" className="min-h-0 h-full">
                <Sidebar>
                  <SidebarHeader className="px-3 py-3">
                    <Marca className="scale-90 origin-left" />
                  </SidebarHeader>
                  <SidebarContent>
                    <SidebarGroup>
                      <SidebarGroupLabel>Operacao</SidebarGroupLabel>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          <SidebarMenuItem>
                            <SidebarMenuButton isActive tooltip="Conversas">
                              <MessageSquareIcon />
                              <span>Conversas</span>
                            </SidebarMenuButton>
                            <SidebarMenuBadge>12</SidebarMenuBadge>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton tooltip="Funil">
                              <KanbanIcon />
                              <span>Funil</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton tooltip="Tarefas">
                              <InboxIcon />
                              <span>Tarefas</span>
                            </SidebarMenuButton>
                            <SidebarMenuBadge>3</SidebarMenuBadge>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton tooltip="Notificacoes">
                              <BellIcon />
                              <span>Notificacoes</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </SidebarGroup>
                    <SidebarGroup>
                      <SidebarGroupLabel>Configuracoes</SidebarGroupLabel>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          <SidebarMenuItem>
                            <SidebarMenuButton tooltip="Equipe">
                              <UsersIcon />
                              <span>Equipe</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton tooltip="Canais">
                              <SettingsIcon />
                              <span>Canais</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </SidebarGroup>
                  </SidebarContent>
                  <SidebarFooter className="p-3">
                    <div className="flex items-center gap-2">
                      <AvatarWithStatus statusValue="online" size="sm">
                        <AvatarFallback>SO</AvatarFallback>
                      </AvatarWithStatus>
                      <div className="min-w-0">
                        <p className="truncate text-ui-13 font-medium">Sara Oliveira</p>
                        <p className="truncate text-ui-11 text-muted-foreground">fono · pre-venda</p>
                      </div>
                    </div>
                  </SidebarFooter>
                </Sidebar>
                <SidebarInset className="overflow-auto">
                  <PageContainer variant="full" className="py-6 px-6">
                    <PageHeader>
                      <PageHeaderRow>
                        <PageHeaderContent>
                          <PageHeaderMeta>
                            <Breadcrumb>
                              <BreadcrumbList>
                                <BreadcrumbItem>
                                  <BreadcrumbLink href="#pagina">Configuracoes</BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator />
                                <BreadcrumbItem>
                                  <BreadcrumbPage>Equipe</BreadcrumbPage>
                                </BreadcrumbItem>
                              </BreadcrumbList>
                            </Breadcrumb>
                          </PageHeaderMeta>
                          <PageHeaderSummary>
                            <PageHeaderTitle>Equipe</PageHeaderTitle>
                            <PageHeaderDescription>Quem atende, em qual departamento, com qual numero.</PageHeaderDescription>
                          </PageHeaderSummary>
                        </PageHeaderContent>
                        <PageHeaderAside>
                          <Button size="sm">
                            <UserPlusIcon data-icon="inline-start" />
                            Convidar
                          </Button>
                        </PageHeaderAside>
                      </PageHeaderRow>
                    </PageHeader>
                    <PageSection>
                      <PageSectionHeader>
                        <PageSectionMeta>
                          <PageSectionSummary>
                            <PageSectionTitle>Membros</PageSectionTitle>
                            <PageSectionDescription>3 ativos · 1 convite pendente</PageSectionDescription>
                          </PageSectionSummary>
                        </PageSectionMeta>
                      </PageSectionHeader>
                      <PageSectionContent>
                        <div className="divide-y divide-border rounded-lg border border-border">
                          {[
                            ["Sara Oliveira", "fono · pre-venda", "membro", "online"],
                            ["Priscila Santos", "cobranca · pos-venda", "membro", "offline"],
                            ["Diogo Vidigal", "COO", "owner", "online"],
                            ["fono2@meescuta.com", "convite enviado ha 2 dias", "pendente", "pending"],
                          ].map(([nome, sub, papel, st]) => (
                            <div key={nome} className="flex items-center gap-3 px-3 py-2">
                              <AvatarWithStatus statusValue={st as "online" | "offline" | "pending"} size="sm">
                                <AvatarFallback>{nome.slice(0, 2).toUpperCase()}</AvatarFallback>
                              </AvatarWithStatus>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-ui-13 font-medium">{nome}</p>
                                <p className="truncate text-ui-11 text-muted-foreground">{sub}</p>
                              </div>
                              <Badge variant={papel === "pendente" ? "warning" : papel === "owner" ? "info" : "secondary"} size="xs">
                                {papel}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </PageSectionContent>
                    </PageSection>
                  </PageContainer>
                </SidebarInset>
              </SidebarProvider>
            </div>
          </Bloco>

          <Bloco id="vazio" titulo="Estado vazio" nota="empty-state.tsx · icone + titulo + descricao + acao">
            <div className="rounded-lg border border-dashed border-border">
              <EmptyStatePresentational
                icon={<InboxIcon />}
                title="Nenhuma conversa neste departamento"
                description="Quando um lead escrever para o numero da pre-venda, ele aparece aqui. Ate la, nada a fazer."
                action={{ label: "Nova conversa", onClick: () => toast("Abrir nova conversa"), icon: <PlusIcon /> }}
              />
            </div>
          </Bloco>

          <Bloco id="identidade" titulo="Badge · Avatar · Skeleton · Spinner">
            <Linha rotulo="badge">
              <Badge>Padrao</Badge>
              <Badge variant="secondary">Secundario</Badge>
              <Badge variant="muted">Discreto</Badge>
              <Badge variant="success">Qualificado</Badge>
              <Badge variant="warning">Lead parado</Badge>
              <Badge variant="destructive">Inadimplente</Badge>
              <Badge variant="info">Meta Ads</Badge>
              <Badge variant="outline">Contorno</Badge>
              <Badge variant="ghost">Fantasma</Badge>
              <Badge size="xs">xs</Badge>
              <Badge size="md">md</Badge>
            </Linha>
            <Linha rotulo="avatar">
              <Avatar size="xs">
                <AvatarFallback>MD</AvatarFallback>
              </Avatar>
              <Avatar size="sm">
                <AvatarFallback>JA</AvatarFallback>
              </Avatar>
              <Avatar size="md" variant="solid">
                <AvatarFallback>AR</AvatarFallback>
              </Avatar>
              <Avatar size="lg" variant="muted">
                <AvatarFallback>SL</AvatarFallback>
              </Avatar>
              <AvatarWithStatus statusValue="online" size="xl" statusLabel="Online">
                <AvatarFallback>FN</AvatarFallback>
              </AvatarWithStatus>
              <AvatarGroup>
                <Avatar>
                  <AvatarFallback>SO</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback>PS</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback>LV</AvatarFallback>
                </Avatar>
                <AvatarGroupCount>+4</AvatarGroupCount>
              </AvatarGroup>
            </Linha>
            <Linha rotulo="skeleton">
              <div className="flex w-full max-w-sm items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </Linha>
            <Linha rotulo="spinner">
              <Spinner />
              <Spinner className="size-6 text-primary" />
              <span className="text-ui-13 text-muted-foreground">Carregando conversas…</span>
            </Linha>
          </Bloco>

          <Bloco id="flutuantes" titulo="Tooltip · Hover card · Dropdown">
            <Linha rotulo="tooltip">
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" size="sm">Passe o mouse</Button>} />
                <TooltipContent>Ultima mensagem ha 3 dias</TooltipContent>
              </Tooltip>
            </Linha>
            <Linha rotulo="hover-card">
              <HoverCard>
                <HoverCardTrigger render={<span className="cursor-default text-ui-13 font-medium underline decoration-dotted">Maria das Dores</span>} />
                <HoverCardContent className="w-72">
                  <div className="flex items-start gap-3">
                    <Avatar size="md">
                      <AvatarFallback>MD</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <p className="text-ui-13 font-semibold">Maria das Dores</p>
                      <p className="text-ui-12 text-muted-foreground">Belo Horizonte · Meta Ads · entrou 08/09</p>
                      <Badge variant="destructive" size="xs">Agora</Badge>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
            </Linha>
            <Linha rotulo="dropdown">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                  Enviar de
                  <ChevronDownIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Numero</DropdownMenuLabel>
                  <DropdownMenuItem>
                    <CheckIcon />
                    +55 31 9999-8888 · Sara (Lite)
                  </DropdownMenuItem>
                  <DropdownMenuItem>+1 555 · Oficial (teste)</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Agendar envio</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Linha>
          </Bloco>

          <Bloco id="feedback" titulo="Toast (sonner) · Alert · Progresso · Accordion">
            <Linha rotulo="toast">
              <Button variant="outline" size="sm" onClick={() => toast("Tarefa criada", { description: "Ligar para Maria das Dores · hoje 16h" })}>
                Neutro
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast.success("Mensagem enviada")}>
                Sucesso
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast.error("Canal inativo", { description: "lite:sara esta pausado — ative em Canais." })}>
                Erro
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast.warning("Lead parado ha 5 dias")}>
                Aviso
              </Button>
            </Linha>
            <div className="grid gap-3 md:grid-cols-2">
              <Alert>
                <AlertIcon>
                  <BellIcon />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Sincronizacao do Kommo</AlertTitle>
                  <AlertDescription>7.100 leads extraidos; 257 sem hierarquia por rate limit.</AlertDescription>
                </AlertContent>
              </Alert>
              <Alert variant="success">
                <AlertIcon>
                  <CheckIcon />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Canal pareado</AlertTitle>
                  <AlertDescription>lite:sara recebendo desde 07/09.</AlertDescription>
                </AlertContent>
              </Alert>
              <Alert variant="warning">
                <AlertIcon>
                  <SearchIcon />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Lead sem origem</AlertTitle>
                  <AlertDescription>36 leads sem utm — recuperaveis pela API do Tintim.</AlertDescription>
                </AlertContent>
              </Alert>
              <Alert variant="destructive">
                <AlertIcon>
                  <TrashIcon />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>App Meta em modo desenvolvimento</AlertTitle>
                  <AlertDescription>Lead Ads nao entra ate o socio liberar leads_retrieval.</AlertDescription>
                </AlertContent>
              </Alert>
            </div>
            <Linha rotulo="progress">
              <Progress value={62} className="w-full max-w-sm">
                <ProgressLabel>Migrations aplicadas</ProgressLabel>
                <ProgressValue />
                <ProgressTrack>
                  <ProgressIndicator />
                </ProgressTrack>
              </Progress>
            </Linha>
            <Linha rotulo="accordion">
              <Accordion className="w-full max-w-lg">
                <AccordionItem value="a">
                  <AccordionTrigger>O que a Clara faz sozinha?</AccordionTrigger>
                  <AccordionContent>Propoe. Humano valida. So entao vira evento no ledger.</AccordionContent>
                </AccordionItem>
                <AccordionItem value="b">
                  <AccordionTrigger>E o credito?</AccordionTrigger>
                  <AccordionContent>Nunca automatico — Levindo recomenda, a Priscila decide.</AccordionContent>
                </AccordionItem>
              </Accordion>
            </Linha>
          </Bloco>

          <Bloco id="audio" titulo="Audio player" nota="bolha de audio do inbox — src de exemplo (sem rede, so o controle)">
            <div className="max-w-md rounded-2xl bg-muted p-3">
              <AudioPlayer src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=" durationHint={12} showSpeed />
            </div>
          </Bloco>

          <Bloco id="tokens" titulo="Tokens" nota="app/globals.css · nomes do LiderHub, valores da Me Escuta onde ja existiam">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {[
                ["background", "bg-background"],
                ["card", "bg-card"],
                ["muted", "bg-muted"],
                ["secondary", "bg-secondary"],
                ["accent", "bg-accent"],
                ["border", "bg-border"],
                ["primary", "bg-primary"],
                ["destructive", "bg-destructive"],
                ["success", "bg-success"],
                ["warning", "bg-warning"],
                ["info", "bg-info"],
                ["sidebar", "bg-sidebar"],
                ["success-tint", "bg-success-tint"],
                ["warning-tint", "bg-warning-tint"],
                ["danger-tint", "bg-danger-tint"],
                ["info-tint", "bg-info-tint"],
                ["brand-navy", "bg-brand-navy"],
                ["brand-orange", "bg-brand-orange"],
                ["chart-1", "bg-chart-1"],
                ["chart-2", "bg-chart-2"],
                ["chart-3", "bg-chart-3"],
                ["chart-4", "bg-chart-4"],
                ["chart-5", "bg-chart-5"],
                ["note", "bg-note"],
              ].map(([nome, cls]) => (
                <div key={nome} className="space-y-1">
                  <div className={`h-10 rounded-md border border-border ${cls}`} />
                  <p className="font-mono text-ui-10 text-muted-foreground">--{nome}</p>
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-1">
              <p className="text-display font-semibold">Display 44</p>
              <p className="text-h1 font-semibold">Titulo h1 32</p>
              <p className="text-h2 font-semibold">Titulo h2 24</p>
              <p className="text-h3 font-semibold">Titulo h3 19</p>
              <p className="text-ui-14">UI 14 — corpo de formulario</p>
              <p className="text-ui-13">UI 13 — tabela e lista</p>
              <p className="text-ui-12 text-muted-foreground">UI 12 — legenda</p>
              <p className="text-ui-11 text-muted-foreground">UI 11 — carimbo</p>
              <p className="text-ui-10 text-muted-foreground">UI 10 — piso da escala (badge xs)</p>
            </div>
          </Bloco>

          <Card size="sm">
            <CardHeader>
              <CardTitle>O que nao esta aqui</CardTitle>
              <CardDescription>Portados mas sem exemplo nesta pagina (a lista completa esta em components/ui)</CardDescription>
            </CardHeader>
            <CardContent className="text-ui-13 text-muted-foreground">
              announcement · button-group · calendar · chevron-toggle · collapsible · color-picker · context-menu · emoji-picker ·
              input-group · money-input · nav-menu · popover · scroll-area · sidebar-collapsible-group · toggle · use-confirm-on-close
            </CardContent>
          </Card>
        </main>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
