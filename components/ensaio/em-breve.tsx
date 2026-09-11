import { CascaConfig } from "./casca-config";

/** Placeholder honesto de seção que ainda não existe — diz o que vai ser, não finge que é. */
export function EmBreve({ titulo, descricao, oQueVem }: { titulo: string; descricao: string; oQueVem: string[] }) {
  return (
    <CascaConfig titulo={titulo} descricao={descricao}>
      <div className="rounded-xl border border-dashed border-border bg-card/60 p-6">
        <p className="text-ui-13 font-medium text-foreground">O que vai morar aqui</p>
        <ul className="mt-2 list-disc pl-5 text-ui-13 leading-relaxed text-muted-foreground">
          {oQueVem.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      </div>
    </CascaConfig>
  );
}
