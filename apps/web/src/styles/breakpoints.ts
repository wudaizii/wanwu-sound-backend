// The one list of screen tiers. CSS writes `@media (--short)` (expanded at build time by the custom-media step in
// vite.config.ts; scripts/check-styles.mjs rejects raw pixel media queries), code reads `media.short`.
// Container queries stay in their components: they respond to a card's own width, not the screen.
export const media={
 /** Phones: one column, compact header, no backdrop art. */
 phone:'(max-width:700px)',
 /** The smallest phones (320–360px): tighter labels and trays. */
 tiny:'(max-width:360px)',
 /** Below this the work pages stack into one scrolling column. */
 'one-column':'(max-width:900px)',
 /** Narrower desktops and landscape tablets: options stack, side columns narrow. */
 narrow:'(max-width:1180px)',
 /** 万物成曲 only: its fixed side column needs room earlier than the other pages. */
 'narrow-compose':'(max-width:1240px)',
 /** Shorter laptop screens (1366 × 768, 1280 × 720): same layout, tighter rhythm, still one screen. */
 short:'(min-width:901px) and (max-height:820px)',
 /** Even shorter screens: secondary lines (subtitles, small hints) step aside. */
 shorter:'(min-width:901px) and (max-height:740px)',
 /** Landscape tablets (1024 × 768): narrow and short at once. */
 'tablet-short':'(min-width:901px) and (max-width:1180px) and (max-height:820px)',
 /** The flow header folds its step labels. */
 'header-compact':'(max-width:1000px)',
 /** The API settings sheet stacks its fields. */
 'sheet-narrow':'(max-width:600px)',
 'reduced-motion':'(prefers-reduced-motion:reduce)',
} as const;
