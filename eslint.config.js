import js from '@eslint/js';import tseslint from 'typescript-eslint';
export default [
 {ignores:['dist/**','dist-connected/**','dist-connected-workers/**','dist-electron/**','dist-services/**','release/**','node_modules/**']},
 js.configs.recommended,
 ...tseslint.configs.recommended,
 {files:['**/*.{ts,tsx,js,mjs,cjs}'],rules:{'no-undef':'off','no-empty':'off','prefer-const':'off','@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-require-imports':'off','@typescript-eslint/no-unused-vars':['warn',{argsIgnorePattern:'^_'}]}}
];
