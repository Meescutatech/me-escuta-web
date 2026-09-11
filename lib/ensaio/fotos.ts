import { PESSOAS } from "./modo";

/**
 * FOTOS DE PERFIL da equipe no ensaio (W-D3 v4, 10/09 — Diogo às 23:45: "ele gosta das carinhas
 * mas quer FOTO de perfil").
 *
 * Medido: `core.usuario` não tem coluna de foto e a API oficial não entrega foto do paciente —
 * é item de backend, registrado pelo Diogo. Na tela o desenho já é o final: quem atende aparece
 * com FOTO (aqui, de banco de imagens: `i.pravatar.cc`), a Clara com um avatar ilustrado próprio
 * (SVG inline — não é gente, e a marca não pode fingir que é), e os pacientes com iniciais até
 * existir foto.
 *
 * Chaves: id de `core.usuario` e e-mail (o `dono_atual` legado é e-mail). Fora do ensaio o mapa
 * chega vazio e todo mundo cai em iniciais.
 */

const PRAVATAR: Record<string, number> = { sara: 47, rodolfo: 59, diogo: 12, fono: 32 };

/** Avatar ilustrado da Clara — laranja, geométrico, sem rosto humano. */
export const AVATAR_CLARA =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#EC662E"/><circle cx="32" cy="27" r="11" fill="#FDEFE7"/><path d="M14 54c2-11 9-16 18-16s16 5 18 16" fill="#FDEFE7"/><circle cx="27.5" cy="26" r="1.8" fill="#EC662E"/><circle cx="36.5" cy="26" r="1.8" fill="#EC662E"/><path d="M27 31c2.5 2.5 7.5 2.5 10 0" stroke="#EC662E" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>`,
  );

export function fotosEnsaio(): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const p of PESSOAS) {
    const n = PRAVATAR[p.chave];
    if (!n) continue;
    const url = `https://i.pravatar.cc/64?img=${n}`;
    mapa[p.id] = url;
    mapa[p.email] = url;
    mapa[p.nome.split(" ")[0]] = url;
  }
  mapa["Clara"] = AVATAR_CLARA;
  mapa["agente:clara"] = AVATAR_CLARA;
  return mapa;
}
