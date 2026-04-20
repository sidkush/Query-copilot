import type * as monacoNs from 'monaco-editor';
import { CALC_KEYWORDS, CALC_LOD_KEYWORDS, functionNames } from './calcFunctionCatalogue';

const functions = functionNames().slice();

export const monarchTokens: monacoNs.languages.IMonarchLanguage = {
  defaultToken: '',
  ignoreCase: false,
  keywords: [...CALC_KEYWORDS],
  lodKeywords: [...CALC_LOD_KEYWORDS],
  functions,
  tokenizer: {
    root: [
      // Comments
      [/\/\/.*$/, 'comment.line'],
      [/\/\*/, { token: 'comment.block', next: '@blockComment' }],

      // String literals
      [/"([^"\\]|\\.)*"/, 'string.double'],
      [/'([^'\\]|\\.)*'/, 'string.single'],

      // Bracketed identifiers — parameters vs fields. Parameters must match first.
      [/\[Parameters\]\.\[([^\]]+)\]/, 'identifier.param'],
      [/\[([^\]]+)\]/, 'identifier.field'],

      // Numbers — float before int so 3.14 is not tokenized as 3 + . + 14
      [/[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?/, 'number.float'],
      [/[0-9]+[eE][+-]?[0-9]+/, 'number.float'],
      [/[0-9]+/, 'number'],

      // LOD curly braces
      [/\{/, 'delimiter.curly.lod'],
      [/\}/, 'delimiter.curly.lod'],

      // Identifiers — classify against LOD keywords, control keywords, functions
      [/[a-zA-Z_][a-zA-Z0-9_]*/, {
        cases: {
          '@lodKeywords': 'keyword.lod',
          '@keywords': 'keyword.control',
          '@functions': 'predefined.function',
          '@default': 'identifier',
        },
      }],

      // Punctuation + operators
      [/[()]/, 'delimiter.parenthesis'],
      [/[,:]/, 'delimiter'],
      [/[+\-*/%<>=!]+/, 'operator'],
      [/\s+/, 'white'],
    ],
    blockComment: [
      [/[^*/]+/, 'comment.block'],
      [/\*\//, { token: 'comment.block', next: '@pop' }],
      [/[*/]/, 'comment.block'],
    ],
  },
} as any;

export const languageConfiguration: monacoNs.languages.LanguageConfiguration = {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  brackets: [['(', ')'], ['{', '}'], ['[', ']']],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '"', close: '"' },
  ],
};

export const themeRules: monacoNs.editor.ITokenThemeRule[] = [
  { token: 'keyword.control',     foreground: 'c586c0', fontStyle: 'bold' },
  { token: 'keyword.lod',         foreground: 'dcdcaa', fontStyle: 'bold' },
  { token: 'predefined.function', foreground: '4ec9b0' },
  { token: 'identifier.field',    foreground: '9cdcfe' },
  { token: 'identifier.param',    foreground: 'ce9178' },
  { token: 'comment.line',        foreground: '6a9955', fontStyle: 'italic' },
  { token: 'comment.block',       foreground: '6a9955', fontStyle: 'italic' },
  { token: 'string.double',       foreground: 'ce9178' },
  { token: 'string.single',       foreground: 'ce9178' },
  { token: 'number',              foreground: 'b5cea8' },
  { token: 'number.float',        foreground: 'b5cea8' },
];
