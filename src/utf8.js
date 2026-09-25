/**
 * UTF-8 do zero — e as sequências que **parecem** válidas e não são.
 *
 * A codificação em si cabe numa tabela:
 *
 *     ponto         bytes   forma
 *     0 a 7F        1       0xxxxxxx
 *     80 a 7FF      2       110xxxxx 10xxxxxx
 *     800 a FFFF    3       1110xxxx 10xxxxxx 10xxxxxx
 *     10000 a 10FFFF 4      11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
 *
 * O desenho é elegante: o primeiro byte diz quantos vêm depois, os seguintes
 * começam todos com `10`, e por isso dá para achar o começo de um caractere a
 * partir de qualquer posição do meio de um texto. ASCII é UTF-8 sem mudar um
 * byte.
 *
 * **A parte que importa não é codificar, é recusar.** Três famílias de
 * sequência são sintaticamente possíveis e proibidas, e cada uma já virou
 * falha de segurança de verdade:
 *
 * 1. **Codificação longa demais.** `2F` é `/`. Mas `C0 AF` também decodifica
 *    para `/` se ninguém conferir — dois bytes para um ponto que cabia em um.
 *    Um filtro que procura `../` no texto cru não acha `C0 AE C0 AE 2F`, e o
 *    decodificador depois entrega `../`. Foi assim que se invadiu o IIS em
 *    2001, e é por isso que a especificação chama a forma longa de **inválida**
 *    em vez de redundante.
 *
 * 2. **Substitutos.** Os pontos `D800` a `DFFF` não são caracteres: são a
 *    metade de um par substituto do UTF-16. Codificá-los em UTF-8 produz o
 *    "CESU-8", que quebra a interoperabilidade e permite representar o mesmo
 *    texto de dois jeitos.
 *
 * 3. **Acima de `10FFFF`.** O espaço Unicode termina ali. A forma de quatro
 *    bytes comportaria até `1FFFFF`, e os pontos acima do limite não existem.
 */

/** Os bytes não formam uma sequência UTF-8 válida. */
export class ErroDeUtf8 extends Error {
  constructor(mensagem, posicao) {
    super(`${mensagem} (byte ${posicao})`);
    this.name = 'ErroDeUtf8';
    this.posicao = posicao;
  }
}

/** O maior ponto de código que existe. */
export const MAIOR_PONTO = 0x10ffff;

/** O começo da faixa de substitutos. */
export const PRIMEIRO_SUBSTITUTO = 0xd800;

/** O fim da faixa de substitutos. */
export const ULTIMO_SUBSTITUTO = 0xdfff;

/** O caractere de substituição, que marca o que não deu para ler. */
export const SUBSTITUICAO = 0xfffd;

/** O menor ponto que cada tamanho pode representar sem ser forma longa. */
export const MINIMO_POR_TAMANHO = [0, 0x0, 0x80, 0x800, 0x10000];

/** Se o ponto é metade de um par substituto. */
export function ehSubstituto(ponto) {
  return ponto >= PRIMEIRO_SUBSTITUTO && ponto <= ULTIMO_SUBSTITUTO;
}

/** Quantos bytes um ponto de código ocupa em UTF-8. */
export function tamanhoEmBytes(ponto) {
  if (ponto < 0x80) return 1;
  if (ponto < 0x800) return 2;
  if (ponto < 0x10000) return 3;

  return 4;
}

/**
 * Codifica uma lista de pontos de código em UTF-8.
 *
 * @param {number[]} pontos
 * @returns {Uint8Array}
 */
export function codificar(pontos) {
  const bytes = [];

  for (const ponto of pontos) {
    if (!Number.isInteger(ponto) || ponto < 0 || ponto > MAIOR_PONTO) {
      throw new RangeError(`ponto de código fora do Unicode: ${ponto}`);
    }

    if (ehSubstituto(ponto)) {
      // Codificar substituto isolado produz CESU-8, que decodificadores
      // corretos recusam. Melhor falhar aqui do que gerar bytes que só o
      // nosso próprio leitor aceita.
      throw new RangeError(
        `U+${ponto.toString(16).toUpperCase()} é metade de um par substituto e não é um caractere`);
    }

    if (ponto < 0x80) {
      bytes.push(ponto);
    } else if (ponto < 0x800) {
      bytes.push(0xc0 | (ponto >> 6), 0x80 | (ponto & 0x3f));
    } else if (ponto < 0x10000) {
      bytes.push(0xe0 | (ponto >> 12), 0x80 | ((ponto >> 6) & 0x3f), 0x80 | (ponto & 0x3f));
    } else {
      bytes.push(
        0xf0 | (ponto >> 18),
        0x80 | ((ponto >> 12) & 0x3f),
        0x80 | ((ponto >> 6) & 0x3f),
        0x80 | (ponto & 0x3f),
      );
    }
  }

  return Uint8Array.from(bytes);
}

/** Quantos bytes a sequência que começa com este byte tem, ou 0 se ele não pode começar uma. */
export function tamanhoPeloPrimeiroByte(byte) {
  if (byte < 0x80) return 1;
  if (byte < 0xc2) return 0; // 80–BF é continuação solta; C0 e C1 só dão forma longa
  if (byte < 0xe0) return 2;
  if (byte < 0xf0) return 3;
  if (byte < 0xf5) return 4;

  return 0; // F5 a FF passariam de U+10FFFF
}

/**
 * A faixa que o **primeiro byte de continuação** pode ocupar.
 *
 * Esta é a ideia mais bonita do formato, e ela costuma passar despercebida: em
 * vez de aceitar `80`–`BF` sempre e conferir o resultado depois, o UTF-8
 * **estreita a faixa** conforme o primeiro byte, de modo que as sequências
 * proibidas fiquem impossíveis de escrever:
 *
 * - `E0` exige `A0`–`BF`, porque `80`–`9F` daria um ponto abaixo de U+0800 —
 *   forma longa.
 * - `ED` exige `80`–`9F`, porque `A0`–`BF` cairia na faixa de substitutos.
 * - `F0` exige `90`–`BF`, porque abaixo disso seria forma longa.
 * - `F4` exige `80`–`8F`, porque acima passaria de U+10FFFF.
 *
 * E `C0`, `C1` e `F5`–`FF` são recusados de saída, porque *qualquer*
 * continuação depois deles produziria algo inválido.
 *
 * O ganho não é só elegância: com as faixas certas, um decodificador rejeita
 * forma longa, substituto e ponto fora do Unicode **sem nunca montar o
 * número** — e é isso que faz o número de caracteres de substituição bater com
 * o da especificação.
 */
export function faixaDaPrimeiraContinuacao(primeiro) {
  if (primeiro === 0xe0) return [0xa0, 0xbf];
  if (primeiro === 0xed) return [0x80, 0x9f];
  if (primeiro === 0xf0) return [0x90, 0xbf];
  if (primeiro === 0xf4) return [0x80, 0x8f];

  return [0x80, 0xbf];
}

/**
 * Por que a faixa de continuação de um byte é estreita.
 *
 * A mensagem de erro precisa dizer isto, e não só "byte fora da faixa": quem
 * lê o log quer saber se recebeu uma **forma longa** (possível ataque), um
 * **substituto** (texto mal convertido de UTF-16) ou um ponto **acima do
 * Unicode** (dado corrompido). São três problemas diferentes.
 */
export function motivoDaFaixa(primeiro) {
  if (primeiro === 0xe0 || primeiro === 0xf0) return 'forma longa';
  if (primeiro === 0xed) return 'substituto';
  if (primeiro === 0xf4) return 'acima do limite do Unicode';

  return null;
}

/** Por que um byte não pode começar sequência nenhuma. */
export function motivoDoPrimeiroByte(primeiro) {
  if (primeiro >= 0x80 && primeiro < 0xc0) return 'é byte de continuação solto';
  if (primeiro === 0xc0 || primeiro === 0xc1) return 'só produziria forma longa';
  if (primeiro >= 0xf5) return 'passaria do limite do Unicode';

  return 'não é um primeiro byte válido';
}

/**
 * Decodifica UTF-8 em pontos de código.
 *
 * @param {Uint8Array} bytes
 * @param {{tolerante?: boolean}} opcoes
 *   `tolerante` troca cada sequência inválida pelo caractere de substituição,
 *   em vez de lançar. É o que um navegador faz; é o que um validador de
 *   entrada **não** deve fazer.
 * @returns {number[]}
 */
export function decodificar(bytes, { tolerante = false } = {}) {
  const pontos = [];
  let i = 0;

  while (i < bytes.length) {
    const primeiro = bytes[i];
    const tamanho = tamanhoPeloPrimeiroByte(primeiro);

    if (tamanho === 0) {
      if (!tolerante) {
        throw new ErroDeUtf8(
          `0x${primeiro.toString(16).padStart(2, '0')} não pode começar uma sequência: `
          + motivoDoPrimeiroByte(primeiro),
          i);
      }

      pontos.push(SUBSTITUICAO);
      i += 1;
      continue;
    }

    let ponto = tamanho === 1 ? primeiro : primeiro & (0x7f >> tamanho);
    let lidos = 1;
    let quebrou = false;

    for (let j = 1; j < tamanho; j += 1) {
      const seguinte = bytes[i + j];
      const [menor, maior] = j === 1 ? faixaDaPrimeiraContinuacao(primeiro) : [0x80, 0xbf];

      if (seguinte === undefined) {
        if (!tolerante) {
          throw new ErroDeUtf8(`sequência de ${tamanho} bytes cortada no fim`, i);
        }

        quebrou = true;
        break;
      }

      if (seguinte < menor || seguinte > maior) {
        if (!tolerante) {
          const motivo = j === 1 ? motivoDaFaixa(primeiro) : null;

          throw new ErroDeUtf8(
            `byte de continuação 0x${seguinte.toString(16).padStart(2, '0')} fora da faixa `
            + `0x${menor.toString(16)}–0x${maior.toString(16)} exigida por `
            + `0x${primeiro.toString(16)}`
            + (motivo ? ` — seria ${motivo}` : ''),
            i + j);
        }

        quebrou = true;
        break;
      }

      ponto = (ponto << 6) | (seguinte & 0x3f);
      lidos += 1;
    }

    if (quebrou) {
      // Um caractere de substituição para a "subparte máxima" — os bytes que
      // chegaram a formar um prefixo válido. O byte que quebrou a sequência
      // **não** é consumido: ele pode começar outra, e engoli-lo perderia um
      // caractere legítimo. É a regra da WHATWG, e é o que faz a contagem de
      // U+FFFD bater com a do navegador.
      pontos.push(SUBSTITUICAO);
      i += lidos;
      continue;
    }

    pontos.push(ponto);
    i += tamanho;
  }

  return pontos;
}

/** O que há de errado com um ponto decodificado, ou `null` se está tudo certo. */
export function conferir(ponto, tamanho) {
  if (ponto < MINIMO_POR_TAMANHO[tamanho]) {
    return (
      `forma longa: U+${ponto.toString(16).toUpperCase()} cabia em `
      + `${tamanhoEmBytes(ponto)} byte(s) e veio em ${tamanho}`
    );
  }

  if (ehSubstituto(ponto)) {
    return `U+${ponto.toString(16).toUpperCase()} é metade de par substituto e não é um caractere`;
  }

  if (ponto > MAIOR_PONTO) {
    return `U+${ponto.toString(16).toUpperCase()} está acima do limite do Unicode`;
  }

  return null;
}

/** Se os bytes são UTF-8 válido. */
export function ehValido(bytes) {
  try {
    decodificar(bytes);

    return true;
  } catch (erro) {
    if (erro instanceof ErroDeUtf8) return false;

    throw erro;
  }
}

/**
 * Onde começa o caractere que contém a posição dada.
 *
 * Só é possível por causa do desenho da codificação: bytes de continuação
 * começam com `10`, então basta andar para trás até achar um que não começa.
 * É o que permite cortar um texto grande ao meio sem parti-lo no meio de um
 * caractere.
 */
export function inicioDoCaractere(bytes, posicao) {
  let i = Math.min(posicao, bytes.length - 1);

  while (i > 0 && (bytes[i] & 0xc0) === 0x80) i -= 1;

  return i;
}
