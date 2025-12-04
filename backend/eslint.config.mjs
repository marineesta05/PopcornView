import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: { 
      globals: globals.node 
    },
    rules: {
      "no-unused-vars": "off",    
      "no-empty": "off",           
      "no-useless-escape": "off",  
    },
  },
  {
    files: ["**/*.{jsx}"],
    ...pluginReact.configs.flat.recommended,
    settings: {
      react: {
        version: "detect"
      }
    }
  },
];