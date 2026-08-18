import js       from '@eslint/js';
import globals  from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(

  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'src/registry/units.generated.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService:  true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'eqeqeq':     ['error', 'always'],
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },

  {
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    // Section 3.1 of the specification forbids binary floating point numbers in
    // metrological values, and Section 3.2 requires exact rational arithmetic on
    // unit exponents. Neither is expressible in an IEEE 754 double, so these
    // directories work on bigint and strings only.
    files: ['src/model/**/*.ts', 'src/codec/**/*.ts', 'src/text/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='Number']",
          message:  'Binary floating point loses decimal scale (spec 3.1). Use bigint and exact string arithmetic.',
        },
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message:  'Binary floating point loses decimal scale (spec 3.1). Use bigint and exact string arithmetic.',
        },
        {
          selector: "MemberExpression[object.name='Math']",
          message:  'Math operates on binary floating point (spec 3.1). Use bigint arithmetic.',
        },
        {
          selector: "MemberExpression[object.name='Number'][property.name=/^(parseFloat|EPSILON)$/]",
          message:  'Binary floating point loses decimal scale (spec 3.1). Use bigint and exact string arithmetic.',
        },
      ],
    },
  },

  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },

);
