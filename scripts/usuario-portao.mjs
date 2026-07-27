// usuario-portao.mjs — cria e autentica o usuário de um portão, com paciência.
//
// Por que existe: rodando os portões em sequência (que é como o verificador roda), o GoTrue local
// devolve 504/AuthRetryableFetchError — o serviço fica atrás por um instante, não quebrado. O
// portão então RECUSAVA por um problema de mesa, e o relatório dizia "não criei o usuário local"
// como se fosse defeito do produto. Pior: antes do `erroLegivel` a mensagem saía como "{}".
//
// A retentativa é só para erro RETENTÁVEL (rede/5xx). Credencial errada, e-mail duplicado ou
// qualquer 4xx falham na hora — insistir num "não" definitivo só atrasa o veredito.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { erroLegivel } from "./erro-legivel.mjs";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function retentavel(erro) {
  const status = Number(erro?.status ?? 0);
  return (
    erro?.name === "AuthRetryableFetchError" ||
    status === 0 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  );
}

async function comPaciencia(rotulo, tentar, tentativas = 5) {
  let ultimo = null;
  for (let i = 0; i < tentativas; i++) {
    const { data, error } = await tentar();
    if (!error) return data;
    ultimo = error;
    if (!retentavel(error)) break;
    const espera = 400 * 2 ** i; // 0,4s · 0,8 · 1,6 · 3,2 — cobre a janela em que o GoTrue respira
    console.log(`  (aguardando ${espera}ms · ${rotulo}: ${erroLegivel(error)})`);
    await dormir(espera);
  }
  throw new Error(`${rotulo}: ${erroLegivel(ultimo)}`);
}

/**
 * Devolve `{ admin, supabase, UID, EMAIL }` — admin com service_role, supabase autenticado como um
 * usuário real recém-criado. Lança com mensagem LEGÍVEL se não der; quem chama decide se recusa.
 */
export async function criarUsuarioDoPortao({ URL, ANON, SERVICE, prefixo }) {
  const EMAIL = `${prefixo}-${randomUUID().slice(0, 8)}@meescuta.local`;
  const SENHA = `${prefixo}-senha-forte-local`;
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  const criado = await comPaciencia("criar usuário do portão", () =>
    admin.auth.admin.createUser({ email: EMAIL, password: SENHA, email_confirm: true }),
  );
  const UID = criado.user.id;

  const supabase = createClient(URL, ANON, { auth: { persistSession: false } });
  await comPaciencia("autenticar", () =>
    supabase.auth.signInWithPassword({ email: EMAIL, password: SENHA }),
  );

  return { admin, supabase, UID, EMAIL };
}
