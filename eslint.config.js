import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'coverage', 'src/styles/generated.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Only the two classic rules are enabled, not the plugin's `recommended`
      // preset. v7 of this plugin also ships the React Compiler rules
      // (`react-hooks/refs`, `immutability`, `use-memo`), which forbid reading
      // refs during render and mutating module state. This library is
      // deliberately imperative — the custom scrollbar writes thumb geometry
      // straight to the DOM specifically to avoid re-rendering the list on every
      // scroll frame, and the render-prop pattern hands a callback out during
      // render. Those rules would flag the design, not a defect.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // Unused args often exist for signature clarity; allow the _ prefix.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // console.error is how a fetch failure is surfaced without an onError.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-param-reassign': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
    },
  },
  {
    // Tests reach into internals and simulate hostile conditions on purpose.
    files: ['test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    files: ['example/**/*.{ts,tsx}'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{ts,js}'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  // Must stay last: switches off anything that would fight Prettier.
  prettier
);
