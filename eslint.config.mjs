import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'migration-upgrade/**', 'supabase/**', '.vercel/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: ['tests/**', 'e2e/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-non-null-asserted-optional-chain': 'off' },
  },
  {
    // The browser bundle must never reference server secrets.
    files: ['apps/web/**'],
    rules: {
      'no-restricted-syntax': ['error', { selector: "Literal[value=/SECRET|SERVICE_ROLE/]", message: 'Server secrets must never be referenced from the web app.' }],
      'no-restricted-imports': ['error', { patterns: ['**/apps/api/**'] }],
    },
  },
);
