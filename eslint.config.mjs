// Minimal ESLint flat config for the scaffold (ESLint 9 + eslint-plugin-astro).
// Intentionally lean: this is bootstrap-only. Richer rules (TS, a11y) are added
// later via /vibe-coding when real pages and islands exist.
import eslintPluginAstro from 'eslint-plugin-astro';

export default [
  ...eslintPluginAstro.configs['flat/recommended'],
  { ignores: ['dist/', '.astro/'] },
];
