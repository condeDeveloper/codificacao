/**
 * UTF-16 e os pares substitutos — a razão de `"😀".length` ser 2 em JavaScript.
 *
 * O Unicode nasceu em 1991 com a promessa de que 16 bits bastariam para todos
 * os caracteres do mundo. Java, JavaScript e Windows acreditaram e construíram
 * as strings deles em cima disso. Em 1996 o Unicode passou de 65.536 pontos, e
 * a promessa quebrou.
 *
 * A saída foi o **par substituto**: dois valores de 16 bits, tirados de uma
 * faixa reservada, representam juntos um ponto acima de `FFFF`. É por isso que
 * a faixa `D800`–`DFFF` não tem caractere nenhum — ela foi esvaziada para
 * caber o remendo.
 *
 * E é por isso que, em JavaScript:
 *
 *     "😀".length          // 2
 *     "😀".charCodeAt(0)   // 55357, que é D83D — metade de nada
 *     [..."😀"].length     // 1, porque o iterador entende pares
 *
 * Uma string JavaScript não é uma sequência de caracteres: é uma sequência de
 * **unidades de 16 bits**, e cortar no meio de um par produz um texto que não
 * representa coisa alguma.
 */

/** A primeira metade de um par vai de D800 a DBFF. */
export const PRIMEIRO_ALTO = 0xd800;

/** A última primeira-metade. */
export const ULTIMO_ALTO = 0xdbff;

/** A segunda metade vai de DC00 a DFFF. */
export const PRIMEIRO_BAIXO = 0xdc00;

/** A última segunda-metade. */
export const ULTIMO_BAIXO = 0xdfff;

/** Acima daqui, precisa de par. */
export const LIMITE_DE_UMA_UNIDADE = 0x10000;

/** Se a unidade é a primeira metade de um par. */
export function ehAlto(unidade) {
  return unidade >= PRIMEIRO_ALTO && unidade <= ULTIMO_ALTO;
}

/** Se a unidade é a segunda metade de um par. */
export function ehBaixo(unidade) {
  return unidade >= PRIMEIRO_BAIXO && unidade <= ULTIMO_BAIXO;
}

/** Quantas unidades de 16 bits um ponto ocupa. */
export function unidadesPara(ponto) {
  return ponto < LIMITE_DE_UMA_UNIDADE ? 1 : 2;
}

/** Quebra um ponto acima de FFFF nas duas metades. */
export function emPar(ponto) {
  if (ponto < LIMITE_DE_UMA_UNIDADE || ponto > 0x10ffff) {
    throw new RangeError(`U+${ponto.toString(16).toUpperCase()} não precisa nem cabe num par`);
  }

  const resto = ponto - LIMITE_DE_UMA_UNIDADE;

  return [PRIMEIRO_ALTO + (resto >> 10), PRIMEIRO_BAIXO + (resto & 0x3ff)];
}

/** Junta duas metades num ponto. */
export function dePar(alto, baixo) {
  if (!ehAlto(alto) || !ehBaixo(baixo)) {
    throw new RangeError('as duas metades precisam ser um par alto e um par baixo, nessa ordem');
  }

  return LIMITE_DE_UMA_UNIDADE + ((alto - PRIMEIRO_ALTO) << 10) + (baixo - PRIMEIRO_BAIXO);
}

/**
 * Codifica pontos em unidades de 16 bits.
 *
 * @param {number[]} pontos
 * @returns {number[]} as unidades
 */
export function codificar(pontos) {
  const unidades = [];

  for (const ponto of pontos) {
    if (!Number.isInteger(ponto) || ponto < 0 || ponto > 0x10ffff) {
      throw new RangeError(`ponto de código fora do Unicode: ${ponto}`);
    }

    if (ponto < LIMITE_DE_UMA_UNIDADE) {
      unidades.push(ponto);
    } else {
      unidades.push(...emPar(ponto));
    }
  }

  return unidades;
}

/**
 * Decodifica unidades de 16 bits em pontos.
 *
 * @param {number[]} unidades
 * @param {{tolerante?: boolean}} opcoes
 * @returns {number[]}
 */
export function decodificar(unidades, { tolerante = false } = {}) {
  const pontos = [];
  let i = 0;

  while (i < unidades.length) {
    const unidade = unidades[i];

    if (ehAlto(unidade)) {
      const seguinte = unidades[i + 1];

      if (seguinte !== undefined && ehBaixo(seguinte)) {
        pontos.push(dePar(unidade, seguinte));
        i += 2;
        continue;
      }

      // Metade alta sem a baixa: é o que sobra quando alguém corta uma string
      // pelo meio com `slice`. O texto resultante não representa nada.
      if (!tolerante) {
        throw new RangeError(`substituto alto solto na posição ${i}`);
      }

      pontos.push(0xfffd);
      i += 1;
      continue;
    }

    if (ehBaixo(unidade)) {
      if (!tolerante) {
        throw new RangeError(`substituto baixo solto na posição ${i}`);
      }

      pontos.push(0xfffd);
      i += 1;
      continue;
    }

    pontos.push(unidade);
    i += 1;
  }

  return pontos;
}

/**
 * Corta uma string JavaScript sem partir um par substituto.
 *
 * `"😀😀".slice(0, 1)` devolve meia string. Esta função recua para a fronteira
 * do caractere anterior, que é o que quase todo lugar que trunca texto —
 * prévia de mensagem, campo com limite, resumo de log — deveria fazer.
 */
export function cortarSemPartir(texto, limite) {
  if (limite >= texto.length) return texto;
  if (limite <= 0) return '';

  // Se o corte cai logo depois de uma metade alta, ela ficaria órfã.
  const anterior = texto.charCodeAt(limite - 1);

  return texto.slice(0, ehAlto(anterior) ? limite - 1 : limite);
}

/**
 * Quantos caracteres de verdade uma string tem.
 *
 * Diferente de `.length`, que conta unidades de 16 bits.
 */
export function quantidadeDeCaracteres(texto) {
  let quantos = 0;

  for (let i = 0; i < texto.length; i += 1) {
    if (ehAlto(texto.charCodeAt(i)) && i + 1 < texto.length && ehBaixo(texto.charCodeAt(i + 1))) {
      i += 1;
    }

    quantos += 1;
  }

  return quantos;
}
