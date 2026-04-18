# Operator Console Fonts

Self-hosted font subset for the **Operator Console** dashboard preset — a phosphor-green mission-control CRT aesthetic built on a monospace body face at two weights.

## Families

| Role      | File               | Family         | Weight | Style  | Source                                                                                                 |
| --------- | ------------------ | -------------- | ------ | ------ | ------------------------------------------------------------------------------------------------------ |
| Mono 400  | `mono.woff2`       | JetBrains Mono | 400    | normal | https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2    |
| Mono 700  | `mono-bold.woff2`  | JetBrains Mono | 700    | normal | https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2    |

JetBrains Mono is a free-and-open monospace family shipped by **JetBrains s.r.o.**, designed for developers and terminal-style interfaces. The Operator Console preset uses it as both body and display face — channel values at 700, labels and log entries at 400.

## Subset

**Latin** — as served by `@fontsource` (Latin Basic + punctuation). No diacritics or extended ranges. If the Operator Console preset ever needs accented characters, fetch the `latin-ext` slices from the same CDN path.

## License

SIL Open Font License, Version 1.1. Full text at [`./LICENSE.txt`](./LICENSE.txt).

> Permission is hereby granted, free of charge, to any person obtaining a copy of the Font Software, to use, study, copy, merge, embed, modify, redistribute, and sell modified and unmodified copies of the Font Software, subject to the following conditions:

(See `LICENSE.txt` for the conditions themselves — reserved names, bundling rules, etc.)

Attribution: **JetBrains s.r.o.** — https://www.jetbrains.com/lp/mono/

## Download date

2026-04-18.

## Re-download

From the repo root, run:

```bash
mkdir -p "frontend/public/fonts/operator-console"
curl -fL -o "frontend/public/fonts/operator-console/mono.woff2" \
  "https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2"
curl -fL -o "frontend/public/fonts/operator-console/mono-bold.woff2" \
  "https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2"
curl -fsSL "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/OFL.txt" \
  > "frontend/public/fonts/operator-console/LICENSE.txt"
```

Expected sizes: `mono.woff2` ~21 KB, `mono-bold.woff2` ~22 KB. Both should start with the magic bytes `wOF2`.
