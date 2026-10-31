// One palette for every chart. Validated for colour blindness and contrast with
// the dataviz checks: the three series pass, and gold relies on the legend and
// tooltips for contrast. Colour follows the measure, so revenue is always gold,
// whichever chart it appears in. Keep these in step with app/globals.css.
export const CHART = {
  revenue: '#e29a1e',
  expenses: '#9a4f2e',
  profit: '#0d9488',
  grid: '#e7e4dc',
  axis: '#746f63',
} as const

export const AXIS_TICK = { fill: CHART.axis, fontSize: 12 }
export const BAR_RADIUS_END: [number, number, number, number] = [0, 4, 4, 0]
export const BAR_RADIUS_TOP: [number, number, number, number] = [4, 4, 0, 0]
