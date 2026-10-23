import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-states/**',
      '**/node_modules/**',
      '**/.bundle/**',
      '**/out/**',
      'coverage/**',
      // iCloud Drive conflict copies of generated folders, e.g. "dist 2".
      '**/* [2-9]/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
