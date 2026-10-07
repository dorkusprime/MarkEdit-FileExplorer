declare const __VERSION__: string;
declare const __DEBUG__: boolean;

/** Vite inlines `?inline` CSS imports as a (minified) string. */
declare module '*.css?inline' {
  const css: string;
  export default css;
}
