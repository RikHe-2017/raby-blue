import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import typescript from '@typescript-eslint/eslint-plugin'
import typescriptParser from '@typescript-eslint/parser'
import prettier from 'eslint-plugin-prettier'

export default [
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: pluginVue.parser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        parser: typescriptParser
      }
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    }
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      'prettier/prettier': 'error',
      // 禁用与 Prettier 冲突的 Vue 规则
      'vue/html-indent': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/attributes-order': 'off'
    },
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser
      }
    },
    plugins: {
      prettier
    }
  }
]
