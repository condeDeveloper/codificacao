/**
 * Latin-1 e Windows-1252 — a diferença de 27 bytes que estraga texto até hoje.
 *
 * O **Latin-1** (ISO-8859-1) mapeia cada byte de 00 a FF diretamente no ponto
 * de código de mesmo valor. É a codificação mais simples que existe, e por isso
 * mesmo é a que nunca falha: qualquer sequência de bytes é Latin-1 válido.
 *
 * O **Windows-1252** é quase igual, e a diferença está na faixa de 80 a 9F, que
 * no Latin-1 é de controles invisíveis. A Microsoft botou ali os caracteres que
 * faltavam para o mercado: aspas curvas, travessão, reticências, o símbolo do
 * euro.
 *
 * Daí sai o defeito mais visível da internet em português. Alguém escreve com
 * aspas curvas no Word, o sistema declara Latin-1 e entrega Windows-1252, e o
 * navegador mostra um controle invisível ou um losango — ou, pior, o texto
 * passa por uma conversão que "conserta" para UTF-8 e sai `â€œ` no lugar de `“`.
 */

/** O que o Windows-1252 põe na faixa 80–9F, que no Latin-1 é controle. */
export const EXTRAS_DO_WINDOWS = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

/** Os cinco bytes que nem o Windows-1252 usa. */
export const NAO_ATRIBUIDOS = [0x81, 0x8d, 0x8f, 0x90, 0x9d];

/**
 * Decodifica bytes em pontos de código.
 *
 * @param {Uint8Array} bytes
 * @param {{windows?: boolean}} opcoes
 * @returns {number[]}
 */
export function decodificar(bytes, { windows = false } = {}) {
  const pontos = [];

  for (const byte of bytes) {
    // Em Latin-1 puro, byte e ponto de código são o mesmo número. É a única
    // codificação de que isso vale, e é por isso que ela nunca dá erro.
    pontos.push(windows ? (EXTRAS_DO_WINDOWS[byte] ?? byte) : byte);
  }

  return pontos;
}

/**
 * Codifica pontos em bytes.
 *
 * @throws {RangeError} para qualquer ponto que não caiba na tabela
 */
export function codificar(pontos, { windows = false } = {}) {
  const inverso = windows
    ? Object.fromEntries(Object.entries(EXTRAS_DO_WINDOWS).map(([b, p]) => [p, Number(b)]))
    : {};

  const bytes = [];

  for (const ponto of pontos) {
    if (windows && inverso[ponto] !== undefined) {
      bytes.push(inverso[ponto]);
      continue;
    }

    if (ponto > 0xff) {
      throw new RangeError(
        `U+${ponto.toString(16).toUpperCase()} não existe em ${windows ? 'Windows-1252' : 'Latin-1'}`);
    }

    if (windows && ponto >= 0x80 && ponto <= 0x9f) {
      throw new RangeError(
        `U+${ponto.toString(16).toUpperCase()} é controle e o Windows-1252 usa esse byte para outra coisa`);
    }

    bytes.push(ponto);
  }

  return Uint8Array.from(bytes);
}

/** Qualquer sequência de bytes é Latin-1 válida — por isso ela nunca falha. */
export function ehValido() {
  return true;
}
