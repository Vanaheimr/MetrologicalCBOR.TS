import js       from '@eslint/js';
import globals  from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(

  {
    ignores: [
      'dist/**',
      'docs/api/**',
      'coverage/**',
      '**/node_modules/**',
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
    // Examples exist to be read and run: printing is the point, and the
    // non-null assertions that would be sloppy in the library are what keeps
    // an example about the format rather than about narrowing types.
    files: ['scripts/**/*.ts', 'examples/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
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
