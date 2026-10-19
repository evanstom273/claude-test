/**
 * SVG elements and attributes, for autocomplete and for spotting element
 * names that won't render.
 */

const PRESENTATION: [string, string[]?][] = [
  ['id'], ['class'], ['style'], ['transform'], ['transform-origin'],
  ['fill', ['none', 'currentColor', 'black', 'white']], ['fill-opacity'], ['fill-rule', ['nonzero', 'evenodd']],
  ['stroke', ['none', 'currentColor', 'black', 'white']], ['stroke-width'], ['stroke-opacity'],
  ['stroke-linecap', ['butt', 'round', 'square']], ['stroke-linejoin', ['miter', 'round', 'bevel', 'arcs', 'miter-clip']],
  ['stroke-dasharray'], ['stroke-dashoffset'], ['stroke-miterlimit'], ['paint-order', ['normal', 'stroke', 'fill', 'markers']],
  ['vector-effect', ['none', 'non-scaling-stroke']], ['opacity'], ['visibility', ['visible', 'hidden', 'collapse']],
  ['display', ['inline', 'none']], ['clip-path'], ['clip-rule', ['nonzero', 'evenodd']], ['mask'], ['filter'],
  ['color'], ['mix-blend-mode', ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']],
  ['font-family'], ['font-size'], ['font-weight', ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']], ['font-style', ['normal', 'italic']],
  ['text-anchor', ['start', 'middle', 'end']], ['dominant-baseline', ['auto', 'middle', 'central', 'hanging', 'alphabetic']],
  ['marker-start'], ['marker-mid'], ['marker-end'], ['pointer-events'], ['shape-rendering', ['auto', 'crispEdges', 'geometricPrecision', 'optimizeSpeed']],
]

const UNITS = ['userSpaceOnUse', 'objectBoundingBox']
const FE = ['in', 'in2', 'result', 'x', 'y', 'width', 'height']

/** Element name: its own attributes (presentation attributes apply to all). */
export const ELEMENTS: Record<string, (string | [string, string[]])[]> = {
  svg: ['xmlns', 'xmlns:xlink', 'viewBox', 'width', 'height', 'x', 'y', 'preserveAspectRatio', 'version'],
  g: [],
  defs: [],
  symbol: ['viewBox', 'preserveAspectRatio', 'x', 'y', 'width', 'height'],
  use: ['href', 'xlink:href', 'x', 'y', 'width', 'height'],
  title: [], desc: [], metadata: [],
  path: ['d', 'pathLength'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
  text: ['x', 'y', 'dx', 'dy', 'rotate', 'textLength', ['lengthAdjust', ['spacing', 'spacingAndGlyphs']]],
  tspan: ['x', 'y', 'dx', 'dy', 'rotate', 'textLength'],
  textPath: ['href', 'startOffset', ['method', ['align', 'stretch']], ['spacing', ['auto', 'exact']]],
  image: ['href', 'x', 'y', 'width', 'height', 'preserveAspectRatio'],
  a: ['href', 'target'],
  switch: [],
  linearGradient: ['x1', 'y1', 'x2', 'y2', ['gradientUnits', UNITS], 'gradientTransform', ['spreadMethod', ['pad', 'reflect', 'repeat']], 'href'],
  radialGradient: ['cx', 'cy', 'r', 'fx', 'fy', 'fr', ['gradientUnits', UNITS], 'gradientTransform', ['spreadMethod', ['pad', 'reflect', 'repeat']], 'href'],
  stop: ['offset', 'stop-color', 'stop-opacity'],
  pattern: ['x', 'y', 'width', 'height', ['patternUnits', UNITS], ['patternContentUnits', UNITS], 'patternTransform', 'viewBox', 'href'],
  clipPath: [['clipPathUnits', UNITS]],
  mask: ['x', 'y', 'width', 'height', ['maskUnits', UNITS], ['maskContentUnits', UNITS], ['mask-type', ['luminance', 'alpha']]],
  marker: ['viewBox', 'refX', 'refY', 'markerWidth', 'markerHeight', ['markerUnits', ['strokeWidth', 'userSpaceOnUse']], ['orient', ['auto', 'auto-start-reverse']]],
  filter: ['x', 'y', 'width', 'height', ['filterUnits', UNITS], ['primitiveUnits', UNITS], ['color-interpolation-filters', ['auto', 'sRGB', 'linearRGB']]],
  feBlend: [...FE, ['mode', ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten']]],
  feColorMatrix: [...FE, ['type', ['matrix', 'saturate', 'hueRotate', 'luminanceToAlpha']], 'values'],
  feComponentTransfer: FE,
  feFuncR: [['type', ['identity', 'table', 'discrete', 'linear', 'gamma']], 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
  feFuncG: [['type', ['identity', 'table', 'discrete', 'linear', 'gamma']], 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
  feFuncB: [['type', ['identity', 'table', 'discrete', 'linear', 'gamma']], 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
  feFuncA: [['type', ['identity', 'table', 'discrete', 'linear', 'gamma']], 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
  feComposite: [...FE, ['operator', ['over', 'in', 'out', 'atop', 'xor', 'arithmetic']], 'k1', 'k2', 'k3', 'k4'],
  feConvolveMatrix: [...FE, 'order', 'kernelMatrix', 'divisor', 'bias', 'targetX', 'targetY', ['edgeMode', ['duplicate', 'wrap', 'none']], 'preserveAlpha'],
  feDiffuseLighting: [...FE, 'surfaceScale', 'diffuseConstant', 'lighting-color'],
  feDisplacementMap: [...FE, 'scale', ['xChannelSelector', ['R', 'G', 'B', 'A']], ['yChannelSelector', ['R', 'G', 'B', 'A']]],
  feDistantLight: ['azimuth', 'elevation'],
  feDropShadow: [...FE, 'dx', 'dy', 'stdDeviation', 'flood-color', 'flood-opacity'],
  feFlood: [...FE, 'flood-color', 'flood-opacity'],
  feGaussianBlur: [...FE, 'stdDeviation', ['edgeMode', ['duplicate', 'wrap', 'none']]],
  feImage: [...FE, 'href', 'preserveAspectRatio'],
  feMerge: FE,
  feMergeNode: ['in'],
  feMorphology: [...FE, ['operator', ['erode', 'dilate']], 'radius'],
  feOffset: [...FE, 'dx', 'dy'],
  fePointLight: ['x', 'y', 'z'],
  feSpecularLighting: [...FE, 'surfaceScale', 'specularConstant', 'specularExponent', 'lighting-color'],
  feSpotLight: ['x', 'y', 'z', 'pointsAtX', 'pointsAtY', 'pointsAtZ', 'specularExponent', 'limitingConeAngle'],
  feTile: FE,
  feTurbulence: [...FE, 'baseFrequency', 'numOctaves', 'seed', ['stitchTiles', ['stitch', 'noStitch']], ['type', ['fractalNoise', 'turbulence']]],
  style: ['type', 'media'],
  animate: ['attributeName', 'from', 'to', 'values', 'dur', 'begin', 'end', ['repeatCount', ['indefinite']], ['fill', ['freeze', 'remove']], 'keyTimes', 'keySplines', ['calcMode', ['linear', 'discrete', 'paced', 'spline']]],
  animateMotion: ['path', 'dur', 'begin', ['repeatCount', ['indefinite']], ['rotate', ['auto', 'auto-reverse']], 'keyPoints', 'keyTimes'],
  animateTransform: ['attributeName', ['type', ['translate', 'scale', 'rotate', 'skewX', 'skewY']], 'from', 'to', 'values', 'dur', 'begin', ['repeatCount', ['indefinite']], 'additive'],
  set: ['attributeName', 'to', 'begin', 'dur'],
  mpath: ['href'],
  view: ['viewBox', 'preserveAspectRatio'],
}

export const KNOWN = new Set(Object.keys(ELEMENTS))

/** The shape @codemirror/lang-xml wants for completion. */
export function xmlSchema() {
  const attr = (a: string | [string, string[]]) => (typeof a === 'string' ? a : { name: a[0], values: a[1] })
  return {
    elements: Object.entries(ELEMENTS).map(([name, attrs]) => ({ name, attributes: attrs.map(attr), top: name === 'svg' })),
    attributes: PRESENTATION.map(([name, values]) => ({ name, global: true, values })),
  }
}
