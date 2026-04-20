import type * as monacoNs from 'monaco-editor';

export const monarchTokens: monacoNs.languages.IMonarchLanguage = { tokenizer: { root: [] } } as any;
export const languageConfiguration: monacoNs.languages.LanguageConfiguration = {};
export const themeRules: monacoNs.editor.ITokenThemeRule[] = [];
