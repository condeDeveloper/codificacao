/**
 * codificacao — UTF-8, UTF-16 e Latin-1 do zero, em Node puro.
 *
 * A parte interessante de uma codificação não é traduzir bytes em caracteres:
 * é **recusar** os bytes que parecem válidos e não são. Cada uma das três
 * tem a sua armadilha, e as três já custaram falha de segurança de verdade.
 */

export * as utf8 from './utf8.js';
export * as utf16 from './utf16.js';
export * as latin1 from './latin1.js';

export { ErroDeUtf8 } from './utf8.js';
