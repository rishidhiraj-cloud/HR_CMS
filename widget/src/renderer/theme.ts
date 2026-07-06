
export interface Theme {
  primary: string
  primaryGradient: string
  primaryGradientHorizontal: string
  badgeGradient: string
  lightAccentText: string
  bubbleColors: string[]
  bgGradient: string
}

const DEFAULT_BASE = '#0d9488'

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return [h * 360, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  s = Math.min(100, Math.max(0, s)) / 100
  l = Math.min(100, Math.max(0, l)) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function lighten(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, Math.min(100, l + amount))
}

export function darken(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, Math.max(0, l - amount))
}

export function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// Keeps the original stop's saturation/lightness, only swaps in the target hue —
// a subtle tint rather than a bright recolor.
function hueShift(stopHex: string, targetHueHex: string): string {
  const [, s, l] = hexToHsl(stopHex)
  const [targetH] = hexToHsl(targetHueHex)
  return hslToHex(targetH, s, l)
}

export function getTheme(company?: string | null): Theme {
  const base =
    company === 'Modicare Ltd.' ? '#0A80B8'
    : company === 'Colorbar Cosmetics' ? '#CC6002'
    : DEFAULT_BASE

  return {
    primary: base,
    primaryGradient: `linear-gradient(135deg, ${base}, ${darken(base, 12)})`,
    primaryGradientHorizontal: `linear-gradient(90deg, ${base}, ${darken(base, 12)})`,
    badgeGradient: `linear-gradient(135deg, ${base}, ${darken(base, 18)})`,
    lightAccentText: lighten(base, 30),
    bubbleColors: [
      `radial-gradient(circle at 40% 35%, ${rgba(base, 0.60)}, ${rgba(darken(base, 15), 0.25)} 55%, transparent 80%)`,
      `radial-gradient(circle at 40% 35%, ${rgba(lighten(base, 10), 0.55)}, ${rgba(base, 0.20)} 55%, transparent 80%)`,
      `radial-gradient(circle at 40% 35%, ${rgba(lighten(base, 25), 0.50)}, ${rgba(base, 0.20)} 55%, transparent 80%)`,
      `radial-gradient(circle at 40% 35%, ${rgba(darken(base, 10), 0.50)}, ${rgba(lighten(base, 10), 0.20)} 55%, transparent 80%)`,
    ],
    bgGradient: `linear-gradient(135deg, ${hueShift('#0a0f1e', base)} 0%, ${hueShift('#0b2d3d', base)} 45%, ${hueShift('#0a1f2a', base)} 100%)`,
  }
}
