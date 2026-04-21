import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      react,
    },
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Credit JSX member-expression usage (<motion.div>) and JSX tags as references
      // to their imported bindings. Without these, no-unused-vars falsely flags
      // `import { motion } from 'framer-motion'` as unused. See Phase 0.2.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'no-unused-vars': ['error', { varsIgnorePattern: '^([A-Z_]|motion$)', argsIgnorePattern: '^_' }],
    },
  },
  // TypeScript linting scoped strictly to chart-ir (sub-project A Phase 0).
  // Applies typescript-eslint's recommended rules only to files inside
  // src/chart-ir/ — the rest of the frontend remains pure JavaScript.
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ['src/chart-ir/**/*.ts'],
  })),
  // Mirror the JS-side underscore-prefix convention for unused names so
  // intentional throwaway destructures (`const { foo: _omit, ...rest } = obj`)
  // and `_arg` parameters do not trip @typescript-eslint/no-unused-vars.
  {
    files: ['src/chart-ir/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
    },
  },
])
