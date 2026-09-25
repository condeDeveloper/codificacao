# codificacao

UTF-8, UTF-16 e Latin-1 escritos do zero em Node puro, sem uma dependência.

A parte interessante de uma codificação não é traduzir bytes em caracteres — é
**recusar** os bytes que parecem válidos e não são. Cada uma das três tem a sua
armadilha, e elas já custaram falha de segurança de verdade.

```
$ node src/cli.js ver "a😀ção"
texto:      a😀ção
caracteres: 5
.length:    6  ← conta unidades de 16 bits, não caracteres

UTF-8   (10 bytes): 61 F0 9F 98 80 C3 A7 C3 A3 6F
UTF-16  (12 bytes): 0061 D83D DE00 00E7 00E3 006F
Latin-1            : não cabe — U+1F600 não existe em Latin-1
```

## A forma longa, que já foi invasão

`2F` é a barra `/`. Mas `C0 AF` decodifica para a **mesma barra** se ninguém
conferir — dois bytes para um ponto que cabia em um.

Daí sai o ataque: um filtro que procura `../` no texto cru não acha
`C0 AE C0 AE 2F`, e o decodificador depois entrega `../` mesmo assim. Foi assim
que se atravessou o diretório do IIS em 2001, e é por isso que a especificação
chama a forma longa de **inválida** em vez de redundante.

```
$ node src/cli.js armadilhas

  C0 AE C0 AE 2F  "../" que um filtro de texto cru não enxerga
                  RECUSADA: 0xc0 não pode começar uma sequência: só produziria forma longa (byte 0)

  ED A0 80        U+D800 — metade de par substituto, o "CESU-8"
                  RECUSADA: byte de continuação 0xa0 fora da faixa 0x80–0x9f exigida por 0xed — seria substituto

  F4 90 80 80     U+110000 — acima do fim do Unicode
                  RECUSADA: byte de continuação 0x90 fora da faixa 0x80–0x8f exigida por 0xf4 — seria acima do limite
```

## A ideia mais bonita do UTF-8

Repare nas mensagens acima: elas não dizem "decodifiquei e o resultado era
inválido". Dizem que o **byte de continuação está fora da faixa**.

É que o UTF-8 não aceita `80`–`BF` sempre para depois conferir o resultado —
ele **estreita a faixa** conforme o primeiro byte, de modo que as sequências
proibidas fiquem impossíveis de escrever:

| primeiro byte | continuação | porque |
|---|---|---|
| `E0` | `A0`–`BF` | abaixo disso seria forma longa |
| `ED` | `80`–`9F` | acima cairia na faixa de substitutos |
| `F0` | `90`–`BF` | abaixo seria forma longa |
| `F4` | `80`–`8F` | acima passaria de U+10FFFF |
| `C0`, `C1`, `F5`–`FF` | — | recusados de saída |

O ganho não é só elegância. Com as faixas certas, o decodificador rejeita forma
longa, substituto e ponto fora do Unicode **sem nunca montar o número** — e é
isso que faz o número de caracteres de substituição bater com o do navegador,
que é a parte difícil de acertar.

**Foi este teste que me corrigiu.** A primeira versão montava o ponto e
conferia depois; ela emitia **um** U+FFFD para `C0 AF` onde a especificação
manda **dois**, e engolia o `A` de `E2 41` junto com a sequência quebrada. O
`TextDecoder` do Node discordou nos dois casos.

## `"😀".length` é 2, e não é bug

O Unicode nasceu em 1991 prometendo que 16 bits bastariam para todos os
caracteres do mundo. Java, JavaScript e Windows acreditaram e construíram as
strings deles em cima disso. Em 1996 o Unicode passou de 65.536 pontos.

A saída foi o **par substituto**: dois valores de 16 bits, tirados de uma faixa
esvaziada de propósito (`D800`–`DFFF`), representam juntos um ponto acima de
`FFFF`.

```js
"😀".length          // 2
"😀".charCodeAt(0)   // 55357 — metade de nada
[..."😀"].length     // 1, porque o iterador entende pares
```

Uma string JavaScript não é uma sequência de caracteres: é uma sequência de
**unidades de 16 bits**. Cortar no meio de um par produz um texto que não
representa coisa alguma — e é exatamente o que `slice` faz em toda prévia de
mensagem, campo com limite e resumo de log:

```js
"😀😀".slice(0, 1)          // meia metade órfã
cortarSemPartir("😀😀", 1)  // "" — recua para a fronteira
```

## Não dá para confiar no `TextDecoder` para codificação legada

Esta seção foi reescrita duas vezes, e as duas correções vieram de testes.

A primeira: escrevi um teste esperando que `TextDecoder('latin1')` fosse
Latin-1, e ele falhou. A especificação da WHATWG define **`iso-8859-1` e
`latin1` como apelidos de `windows-1252`** — porque tanta página declara
Latin-1 e entrega Windows-1252 que o comportamento tolerante virou o padrão.

A segunda veio do CI: **no Node 20 do runner, `TextDecoder('latin1')` devolve
Latin-1 puro**, e `TextDecoder('windows-1252')` também. Codificações que não
são UTF-8 dependem do ICU com que o Node foi compilado, e builds diferentes se
comportam diferente.

A conclusão é mais forte que a primeira versão: não dá para contar com o
`TextDecoder` para codificação legada nenhuma — nem para *pedir* Windows-1252,
nem para *evitá-lo*. Quem precisa de uma das duas de verdade faz à mão, e é o
que este módulo faz. O teste agora **descobre** o comportamento da build e
confere contra o modo certo.

A diferença está na faixa `80`–`9F`, que no Latin-1 é de controles invisíveis e
no Windows-1252 tem as aspas curvas, o travessão, as reticências e o euro. É a
origem do defeito mais visível da internet em português: alguém escreve no
Word, o sistema declara Latin-1, e o texto sai com losango — ou, pior, passa por
uma conversão que "conserta" para UTF-8 e vira `â€œ` no lugar de `“`.

## O oráculo

O `TextEncoder` e o `TextDecoder` do Node implementam a especificação da WHATWG
em C++. Os testes comparam contra eles:

- **cinco mil cadeias sorteadas**, com pontos de todo o espaço Unicode,
  conferidas byte a byte na codificação e ponto a ponto na volta;
- os casos **inválidos**, onde a especificação diz *quantos* caracteres de
  substituição emitir — e é aí que implementações caseiras erram;
- os **256 bytes** do Latin-1 e do Windows-1252, um a um.

## Rodando

Não há o que instalar. Node 18 ou mais novo.

```bash
node src/cli.js ver "a😀ção"
node src/cli.js conferir arquivo.txt
node src/cli.js armadilhas
```

Como biblioteca:

```js
import { utf8, utf16, latin1 } from './src/index.js';

utf8.codificar([0x1f600]);                    // Uint8Array(4) [F0 9F 98 80]
utf8.decodificar(bytes);                      // lança em sequência inválida
utf8.decodificar(bytes, { tolerante: true }); // troca por U+FFFD, como o navegador
utf8.ehValido(bytes);                         // true/false, sem lançar

utf8.inicioDoCaractere(bytes, 3);             // onde começa o caractere daquela posição
utf16.cortarSemPartir(texto, 100);            // trunca sem quebrar par substituto
utf16.quantidadeDeCaracteres(texto);          // o que `.length` deveria ter sido

latin1.decodificar(bytes);                    // Latin-1 puro, que o Node não oferece
latin1.decodificar(bytes, { windows: true }); // Windows-1252
```

```bash
npm test
```

56 testes.

## Estrutura

```
src/utf8.js     a tabela, as faixas de continuação e as três famílias de inválido
src/utf16.js    pares substitutos, e por que "😀".length é 2
src/latin1.js   Latin-1, Windows-1252 e os 27 bytes que os separam
src/cli.js      ver, conferir e a demonstração das armadilhas
```

## Limites conhecidos

- **Sem UTF-32, sem UTF-7 e sem as codificações asiáticas.** Shift-JIS,
  GB18030 e EUC-KR são tabelas grandes e um problema diferente.
- **Sem marca de ordem de bytes.** O UTF-16 aqui trabalha com unidades, não
  com bytes, então não há o que ordenar nem BOM que interpretar.
- **Sem normalização.** `é` como um ponto e `é` como `e` + acento combinante
  são textos diferentes que se parecem iguais — é o `unicodedata`/`normalize`,
  outro assunto.
- **Sem segmentação por grafema.** `👨‍👩‍👧` é um caractere para quem olha e
  cinco pontos de código; `quantidadeDeCaracteres` conta cinco.
- **Sem fluxo.** Tudo trabalha sobre o buffer inteiro; um decodificador de
  fluxo precisa guardar a sequência incompleta entre pedaços.
- **Sem otimização.** O laço é byte a byte, sem tabela de salto nem SIMD.

## Onde ele se encaixa

Faz par com o
[`analisador-json`](https://github.com/condeDeveloper/analisador-json) e o
[`cliente-http`](https://github.com/condeDeveloper/cliente-http): os dois
precisam decidir o que fazer quando os bytes que chegam não formam texto
válido, e a resposta certa quase nunca é "decodifica assim mesmo".

## Licença

MIT.
