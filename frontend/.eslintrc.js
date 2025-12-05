module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "react-app",
    "react-app/jest",
  ],
  plugins: ["react"],
  rules: {
    "no-unused-vars": "warn",
    "no-empty": "warn",
    "no-useless-escape": "warn",
    "react/react-in-jsx-scope": "off",  
    "react/no-unescaped-entities": "off",
  },
  settings: {
    react: { version: "detect" },
  },
};