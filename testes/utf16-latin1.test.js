import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  codificar as codificarUtf16,
  cortarSemPartir,
  decodificar as decodificarUtf16,
  dePar,
  ehAlto,
  ehBaixo,
  emPar,
  quantidadeDeCaracteres,
  unidadesPara,
} from '../src/utf16.js';

import {
  codificar as codificarLatin,
  decodificar as decodificarLatin,
  EXTRAS_DO_WINDOWS,
  NAO_ATRIBUIDOS,
} from '../src/latin1.js';


function unidades(texto) {
  return Array.from({ length: texto.length }, (_, i) => texto.charCodeAt(i));
}

describe('os pares substitutos', () => {
  it('é por isso que "😀".length é 2', () => {
    // Uma string JavaScript não é uma sequência de caracteres: é uma sequência
    // de unidades de 16 bits.
    assert.equal('😀'.length, 2);
    assert.equal([...'😀'].length, 1);
    assert.equal(quantidadeDeCaracteres('😀'), 1);
  });

  it('a metade sozinha não é nada', () => {
    assert.equal('😀'.charCodeAt(0), 0xd83d);
    assert.equal(ehAlto(0xd83d), true);
    assert.equal(ehBaixo('😀'.charCodeAt(1)), true);
  });

  it('quebrar e juntar é ida e volta', () => {
    for (const ponto of [0x10000, 0x1f600, 0x10ffff, 0x20ac0]) {
      const [alto, baixo] = emPar(ponto);

      assert.equal(dePar(alto, baixo), ponto, `U+${ponto.toString(16)}`);
    }
  });

  it('bate com o que o JavaScript faz', () => {
    for (const ponto of [0x10000, 0x1f600, 0x10ffff]) {
      const texto = String.fromCodePoint(ponto);

      assert.deepEqual(emPar(ponto), [texto.charCodeAt(0), texto.charCodeAt(1)]);
    }
  });

  it('abaixo de FFFF não precisa de par', () => {
    assert.equal(unidadesPara(0x41), 1);
    assert.equal(unidadesPara(0xffff), 1);
    assert.equal(unidadesPara(0x10000), 2);

    assert.throws(() => emPar(0x41), RangeError);
  });

  it('as metades precisam vir na ordem certa', () => {
    const [alto, baixo] = emPar(0x1f600);

    assert.throws(() => dePar(baixo, alto), RangeError);
  });
});

describe('codificar e decodificar UTF-16', () => {
  it('bate com as unidades que o JavaScript usa', () => {
    const textos = ['', 'a', 'ação', '日本語', '😀', 'a😀b', '😀😃😄'];

    for (const texto of textos) {
      const pontos = [...texto].map((c) => c.codePointAt(0));

      assert.deepEqual(codificarUtf16(pontos), unidades(texto), JSON.stringify(texto));
      assert.deepEqual(decodificarUtf16(unidades(texto)), pontos, JSON.stringify(texto));
    }
  });

  it('metade solta é recusada', () => {
    assert.throws(() => decodificarUtf16([0xd83d]), /alto solto/);
    assert.throws(() => decodificarUtf16([0xde00]), /baixo solto/);
    assert.throws(() => decodificarUtf16([0xd83d, 0x41]), /alto solto/);
  });

  it('no modo tolerante a metade solta vira U+FFFD', () => {
    assert.deepEqual(decodificarUtf16([0xd83d, 0x41], { tolerante: true }), [0xfffd, 0x41]);
  });

  it('ponto fora do Unicode é recusado', () => {
    assert.throws(() => codificarUtf16([0x110000]), RangeError);
  });
});

describe('cortar sem partir o caractere', () => {
  it('o slice cru parte o par ao meio', () => {
    // É o que acontece em toda prévia de mensagem, campo com limite e resumo
    // de log que usa `slice` direto.
    const partido = '😀😀'.slice(0, 1);

    assert.equal(partido.length, 1);
    assert.equal(ehAlto(partido.charCodeAt(0)), true, 'sobrou meia metade');
  });

  it('recua para a fronteira anterior', () => {
    assert.equal(cortarSemPartir('😀😀', 1), '');
    assert.equal(cortarSemPartir('😀😀', 2), '😀');
    assert.equal(cortarSemPartir('😀😀', 3), '😀');
    assert.equal(cortarSemPartir('😀😀', 4), '😀😀');
  });

  it('não mexe em texto sem par', () => {
    // `ç` e `ã` estão no plano básico: ocupam uma unidade cada, e o corte
    // não tem o que recuar.
    assert.equal(cortarSemPartir('abcdef', 3), 'abc');
    assert.equal(cortarSemPartir('ação', 3), 'açã');
  });

  it('o resultado é sempre uma string válida', () => {
    const texto = 'a😀b😃c😄';

    for (let limite = 0; limite <= texto.length + 2; limite += 1) {
      const cortado = cortarSemPartir(texto, limite);

      for (let i = 0; i < cortado.length; i += 1) {
        if (ehAlto(cortado.charCodeAt(i))) {
          assert.ok(ehBaixo(cortado.charCodeAt(i + 1)), `metade órfã com limite ${limite}`);
          i += 1;
        } else {
          assert.equal(ehBaixo(cortado.charCodeAt(i)), false, `baixo órfão com limite ${limite}`);
        }
      }
    }
  });

  it('conta caracteres, não unidades', () => {
    assert.equal('a😀b'.length, 4);
    assert.equal(quantidadeDeCaracteres('a😀b'), 3);
    assert.equal(quantidadeDeCaracteres(''), 0);
    assert.equal(quantidadeDeCaracteres('ação'), 4);
  });
});

describe('Latin-1', () => {
  it('byte e ponto de código são o mesmo número', () => {
    // É a única codificação de que isso vale, e é por isso que ela nunca
    // falha: qualquer sequência de bytes é Latin-1 válido.
    const bytes = Uint8Array.from([0x00, 0x41, 0x7f, 0x80, 0xe7, 0xff]);

    assert.deepEqual(decodificarLatin(bytes), [0x00, 0x41, 0x7f, 0x80, 0xe7, 0xff]);
  });

  it('o TextDecoder("latin1") do Node NÃO é Latin-1', () => {
    // Descoberta deste teste, e ela é da especificação: a WHATWG define
    // "iso-8859-1" e "latin1" como **apelidos de windows-1252**, justamente
    // porque tanta página declara Latin-1 e entrega Windows-1252 que o
    // comportamento tolerante virou o padrão.
    //
    // Ou seja: não existe jeito de pedir Latin-1 puro ao `TextDecoder`. Um
    // sistema que precisa dele de verdade — lendo arquivo antigo, protocolo
    // legado — precisa fazer à mão, que é o que este módulo faz.
    const doNode = new TextDecoder('latin1');
    const bytes = Uint8Array.from(Array.from({ length: 256 }, (_, i) => i));

    const puro = String.fromCodePoint(...decodificarLatin(bytes));
    const comWindows = String.fromCodePoint(...decodificarLatin(bytes, { windows: true }));

    assert.notEqual(puro, doNode.decode(bytes), 'o Node não devolve Latin-1 puro');
    assert.equal(comWindows, doNode.decode(bytes), 'o que ele devolve é Windows-1252');
  });

  it('o Latin-1 puro difere justamente na faixa 80–9F', () => {
    const faixa = Uint8Array.from(Array.from({ length: 32 }, (_, i) => 0x80 + i));

    assert.deepEqual(decodificarLatin(faixa), [...faixa], 'em Latin-1, byte é ponto de código');
  });

  it('acima de FF não cabe', () => {
    assert.throws(() => codificarLatin([0x100]), RangeError);
    assert.throws(() => codificarLatin([0x20ac]), RangeError);
  });

  it('ida e volta em todos os 256 bytes', () => {
    const bytes = Uint8Array.from(Array.from({ length: 256 }, (_, i) => i));

    assert.deepEqual([...codificarLatin(decodificarLatin(bytes))], [...bytes]);
  });
});

describe('Windows-1252, que é quase Latin-1', () => {
  it('a diferença está só na faixa 80–9F', () => {
    for (let byte = 0; byte < 256; byte += 1) {
      const comum = decodificarLatin(Uint8Array.from([byte]))[0];
      const windows = decodificarLatin(Uint8Array.from([byte]), { windows: true })[0];

      if (byte < 0x80 || byte > 0x9f) {
        assert.equal(comum, windows, `byte ${byte.toString(16)} devia ser igual nos dois`);
      }
    }
  });

  it('as aspas curvas que estragam texto na internet', () => {
    // Alguém escreve no Word, o sistema declara Latin-1 e entrega
    // Windows-1252 — e o navegador mostra um controle invisível no lugar de “.
    const bytes = Uint8Array.from([0x93, 0x61, 0x94]);

    assert.deepEqual(decodificarLatin(bytes, { windows: true }), [0x201c, 0x61, 0x201d]);
    assert.deepEqual(decodificarLatin(bytes), [0x93, 0x61, 0x94], 'em Latin-1 são controles');
  });

  it('bate com o TextDecoder windows-1252 do Node', () => {
    const decodificador = new TextDecoder('windows-1252');

    for (let byte = 0; byte < 256; byte += 1) {
      if (NAO_ATRIBUIDOS.includes(byte)) continue;

      const meu = String.fromCodePoint(...decodificarLatin(Uint8Array.from([byte]), { windows: true }));

      assert.equal(meu, decodificador.decode(Uint8Array.from([byte])), `byte 0x${byte.toString(16)}`);
    }
  });

  it('o euro está no byte 80', () => {
    assert.equal(EXTRAS_DO_WINDOWS[0x80], 0x20ac);
    assert.deepEqual([...codificarLatin([0x20ac], { windows: true })], [0x80]);
  });

  it('cinco bytes não são atribuídos nem no Windows-1252', () => {
    assert.deepEqual(NAO_ATRIBUIDOS, [0x81, 0x8d, 0x8f, 0x90, 0x9d]);

    for (const byte of NAO_ATRIBUIDOS) {
      assert.equal(EXTRAS_DO_WINDOWS[byte], undefined);
    }
  });

  it('controle não pode ser codificado em Windows-1252', () => {
    // O byte 0x93 está ocupado pelas aspas: não há como escrever o controle.
    assert.throws(() => codificarLatin([0x93], { windows: true }), RangeError);
  });
});
