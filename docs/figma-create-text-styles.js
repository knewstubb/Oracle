/**
 * Figma Plugin Script — Create Text Styles + Sample Text Nodes
 *
 * Run this in Figma:
 *   1. Open your Oracle Figma file
 *   2. Go to Plugins → Development → New Plugin → "Run once"
 *   3. Paste this entire script into the code editor
 *   4. Click "Run"
 *
 * This creates:
 *   - Text styles for every type scale entry (Regular + Medium weights)
 *   - A frame on the current page with sample text at each style
 */

// Font family to use (must be loaded in Figma)
const FONT_FAMILY = "Helvetica Neue"
const FONT_MONO = "SF Mono"

// Type scale from tokens.css
const TYPE_SCALE = [
  { name: "2xs", size: 10, usage: "Version badge, debug text" },
  { name: "xs", size: 11, usage: "Chip labels, metadata, timestamps" },
  { name: "sm", size: 12, usage: "Table cells, secondary text" },
  { name: "base", size: 13, usage: "Body text default" },
  { name: "md", size: 14, usage: "Buttons, nav items, primary UI text" },
  { name: "lg", size: 16, usage: "Section headings, card titles" },
  { name: "xl", size: 20, usage: "Page titles" },
  { name: "2xl", size: 24, usage: "Display numbers (collection value)" },
  { name: "3xl", size: 28, usage: "Hero text" },
]

const WEIGHTS = [
  { name: "Regular", style: "Regular", value: 400 },
  { name: "Medium", style: "Medium", value: 500 },
]

async function main() {
  // Load fonts
  await figma.loadFontAsync({ family: FONT_FAMILY, style: "Regular" })
  await figma.loadFontAsync({ family: FONT_FAMILY, style: "Medium" })

  // Create a frame to hold the samples
  const frame = figma.createFrame()
  frame.name = "Text Styles"
  frame.resize(800, 50 + TYPE_SCALE.length * WEIGHTS.length * 48)
  frame.layoutMode = "VERTICAL"
  frame.primaryAxisSizingMode = "AUTO"
  frame.counterAxisSizingMode = "FIXED"
  frame.paddingTop = 32
  frame.paddingBottom = 32
  frame.paddingLeft = 32
  frame.paddingRight = 32
  frame.itemSpacing = 16
  frame.fills = [{ type: "SOLID", color: { r: 0.075, g: 0.075, b: 0.086 } }] // bg-canvas

  // Create text styles and sample nodes
  for (const scale of TYPE_SCALE) {
    for (const weight of WEIGHTS) {
      const styleName = `${scale.name}/${weight.name}`

      // Create the text style
      const style = figma.createTextStyle()
      style.name = styleName
      style.fontSize = scale.size
      style.fontName = { family: FONT_FAMILY, style: weight.style }
      style.lineHeight = { value: Math.round(scale.size * 1.5), unit: "PIXELS" }
      style.letterSpacing = { value: 0, unit: "PIXELS" }

      // Create a sample text node
      const text = figma.createText()
      text.characters = `${styleName} — ${scale.size}px ${weight.name} — ${scale.usage}`
      text.fontSize = scale.size
      text.fontName = { family: FONT_FAMILY, style: weight.style }
      text.lineHeight = { value: Math.round(scale.size * 1.5), unit: "PIXELS" }
      text.fills = [{ type: "SOLID", color: { r: 0.91, g: 0.91, b: 0.918 } }] // text-primary
      text.textStyleId = style.id

      frame.appendChild(text)
    }

    // Add spacer between scale groups
    const spacer = figma.createFrame()
    spacer.name = "spacer"
    spacer.resize(800, 8)
    spacer.fills = []
    frame.appendChild(spacer)
  }

  // Position frame in viewport
  frame.x = 0
  frame.y = 0
  figma.viewport.scrollAndZoomIntoView([frame])

  figma.notify(`Created ${TYPE_SCALE.length * WEIGHTS.length} text styles ✓`)
  figma.closePlugin()
}

main()
