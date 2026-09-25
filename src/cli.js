#!/usr/bin/env node
/**
 * A linha de comando.
 *
 *     codificacao ver "texto"        os bytes de um texto nas três codificações
 *     codificacao conferir <arquivo> se o arquivo é UTF-8 válido, e onde não é
 *     codificacao armadilhas         as sequências que parecem válidas e não são
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as latin1 from './latin1.js';
import * as utf16 from './utf16.js';
import * as utf8 from './utf8.js';

const USO = `codificacao — UTF-8, UTF-16 e Latin-1 do zero

  ver "<texto>"        os bytes do texto nas três codificações
  conferir <arquivo>   se o arquivo é UTF-8 válido, e onde não é
  armadilhas           as sequências que parecem válidas e não são`;

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

function ver(texto) {
  const pontos = [...texto].map((c) => c.codePointAt(0));

  console.log(`texto:      ${texto}`);
  console.log(`caracteres: ${pontos.length}`);
  console.log(`.length:    ${texto.length}  ${texto.length !== pontos.length ? '← conta unidades de 16 bits, não caracteres' : ''}`);
  console.log();

  const bytes = utf8.codificar(pontos);

  console.log(`UTF-8   (${String(bytes.length).padStart(2)} bytes): ${hex(bytes)}`);

  const unidades = utf16.codificar(pontos);
  const comoHex = unidades.map((u) => u.toString(16).padStart(4, '0').toUpperCase()).join(' ');

  console.log(`UTF-16  (${String(unidades.length * 2).padStart(2)} bytes): ${comoHex}`);

  try {
    const emLatin = latin1.codificar(pontos);

    console.log(`Latin-1 (${String(emLatin.length).padStart(2)} bytes): ${hex(emLatin)}`);
  } catch (erro) {
    console.log(`Latin-1            : não cabe — ${erro.message}`);
  }

  console.log('\npontos de código:');

  for (const ponto of pontos) {
    const nome = `U+${ponto.toString(16).toUpperCase().padStart(4, '0')}`;

    console.log(`  ${nome.padEnd(9)} ${String.fromCodePoint(ponto)}  ${utf8.tamanhoEmBytes(ponto)} byte(s) em UTF-8, ${utf16.unidadesPara(ponto)} unidade(s) em UTF-16`);
  }

  return 0;
}

function conferir(caminho) {
  let bytes;

  try {
    bytes = readFileSync(caminho);
  } catch (erro) {
    console.error(`não consegui ler ${basename(caminho)}: ${erro.message}`);

    return 2;
  }

  try {
    const pontos = utf8.decodificar(bytes);

    console.log(`${basename(caminho)}: UTF-8 válido`);
    console.log(`  ${bytes.length} byte(s), ${pontos.length} caractere(s)`);

    return 0;
  } catch (erro) {
    console.log(`${basename(caminho)}: NÃO é UTF-8 válido`);
    console.log(`  ${erro.message}`);

    const inicio = Math.max(0, erro.posicao - 8);
    const trecho = bytes.subarray(inicio, erro.posicao + 8);

    console.log(`  bytes ao redor: ${hex(trecho)}`);
    console.log(`  ${' '.repeat('  bytes ao redor: '.length - 2 + (erro.posicao - inicio) * 3)}^^`);

    return 1;
  }
}

function armadilhas() {
  const casos = [
    ['2F', [0x2f], 'a barra normal'],
    ['C0 AF', [0xc0, 0xaf], 'a mesma barra em forma longa — o ataque ao IIS de 2001'],
    ['C0 AE C0 AE 2F', [0xc0, 0xae, 0xc0, 0xae, 0x2f], '"../" que um filtro de texto cru não enxerga'],
    ['ED A0 80', [0xed, 0xa0, 0x80], 'U+D800 — metade de par substituto, o "CESU-8"'],
    ['F4 90 80 80', [0xf4, 0x90, 0x80, 0x80], 'U+110000 — acima do fim do Unicode'],
    ['C2 41', [0xc2, 0x41], 'promete continuação e vem um "A"'],
    ['E2 82', [0xe2, 0x82], 'cortado no fim'],
    ['80', [0x80], 'byte de continuação solto'],
  ];

  console.log('SEQUÊNCIAS QUE PARECEM VÁLIDAS\n');

  for (const [rotulo, bytes, explicacao] of casos) {
    const entrada = Uint8Array.from(bytes);
    let veredito;

    try {
      const pontos = utf8.decodificar(entrada);

      veredito = `aceita → ${pontos.map((p) => `U+${p.toString(16).toUpperCase()}`).join(' ')}`;
    } catch (erro) {
      veredito = `RECUSADA: ${erro.message}`;
    }

    console.log(`  ${rotulo.padEnd(15)} ${explicacao}`);
    console.log(`  ${' '.repeat(15)} ${veredito}\n`);
  }

  console.log('No modo tolerante, cada uma vira o caractere de substituição —');
  console.log('e o número de U+FFFD bate com o do navegador, que é a parte difícil.');

  return 0;
}

export function principal(argumentos) {
  const [comando, ...resto] = argumentos;

  if (!comando) {
    console.log(USO);

    return 1;
  }

  if (comando === 'ver') {
    if (!resto[0]) {
      console.error('uso: ver "<texto>"');

      return 1;
    }

    return ver(resto.join(' '));
  }

  if (comando === 'conferir') {
    if (!resto[0]) {
      console.error('uso: conferir <arquivo>');

      return 1;
    }

    return conferir(resto[0]);
  }

  if (comando === 'armadilhas') return armadilhas();

  console.error(`comando desconhecido: ${comando}\n\n${USO}`);

  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv.slice(2));
}
