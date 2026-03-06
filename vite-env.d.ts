/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BUILD_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
