/** WCAG contrast helpers. Read colours from the token CSS so tests check the tokens, not copies of hex values. */
export interface Rgba { r: number; g: number; b: number; a: number }

export function parseColor(value: string): Rgba {
  const v = value.trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v)
  if (rgba) return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] === undefined ? 1 : +rgba[4] }
  throw new Error(`Cannot parse colour: ${value}`)
}

/** Paint `top` over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number) => Math.round(t * top.a + b * (1 - top.a))
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 }
}

export function luminance({ r, g, b }: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Value of `--name` in token CSS, following one level of `var(--other)` aliases. */
export function tokenValue(css: string, name: string): string {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css)
  if (!m) throw new Error(`Token ${name} not found`)
  const alias = /^var\((--[\w-]+)\)$/.exec(m[1].trim())
  return alias ? tokenValue(css, alias[1]) : m[1].trim()
}
