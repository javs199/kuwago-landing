import js from '../apps/admin/node_modules/@eslint/js/src/index.js';
import globals from '../apps/admin/node_modules/globals/index.js';
export default [js.configs.recommended,{
  files:['assets/js/catalog-*.js','assets/js/marketplace*.js','assets/js/properties-adapter.js'],
  languageOptions:{sourceType:'module',globals:{...globals.browser,i18n:'readonly'}},
}];
