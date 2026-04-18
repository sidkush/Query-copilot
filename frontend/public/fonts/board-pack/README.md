# Board Pack Fonts

Self-hosted font subset for the **Board Pack** dashboard preset — a bold grotesk display face paired with its regular-weight companion on a light cream-paper background.

## Families

| Role    | File             | Family        | Weight | Style  | Source                                                                                         |
| ------- | ---------------- | ------------- | ------ | ------ | ---------------------------------------------------------------------------------------------- |
| Display | `display.woff2`  | Archivo Black | 400    | normal | https://cdn.jsdelivr.net/npm/@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2 |
| Body    | `body.woff2`     | Archivo       | 400    | normal | https://cdn.jsdelivr.net/npm/@fontsource/archivo/files/archivo-latin-400-normal.woff2          |

Archivo Black is a single-weight black display face (400 is the canonical weight name in the Fontsource distribution). Archivo is its sibling text family, used here at 400 regular for body copy.

Both families are authored by **Omnibus-Type**.

## Subset

**Latin** — as served by `@fontsource` (Latin Basic + punctuation). No diacritics or extended ranges. If the Board Pack preset ever needs accented characters, fetch the `latin-ext` slices from the same CDN path.

## License

SIL Open Font License, Version 1.1. Full text at [`./LICENSE.txt`](./LICENSE.txt).

> Permission is hereby granted, free of charge, to any person obtaining a copy of the Font Software, to use, study, copy, merge, embed, modify, redistribute, and sell modified and unmodified copies of the Font Software, subject to the following conditions:

(See `LICENSE.txt` for the conditions themselves — reserved names, bundling rules, etc.)

## Download date

2026-04-18.

## Re-download

From the repo root, run:

```bash
mkdir -p "frontend/public/fonts/board-pack"
curl -fL -o "frontend/public/fonts/board-pack/display.woff2" \
  "https://cdn.jsdelivr.net/npm/@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2"
curl -fL -o "frontend/public/fonts/board-pack/body.woff2" \
  "https://cdn.jsdelivr.net/npm/@fontsource/archivo/files/archivo-latin-400-normal.woff2"
curl -fsSL "https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/OFL.txt" \
  > "frontend/public/fonts/board-pack/LICENSE.txt"
```

Expected sizes: `display.woff2` ~19 KB, `body.woff2` ~15 KB. Both should start with the magic bytes `wOF2`.
