'use strict';

// SAMPLE, UNVALIDATED DATA. Approximate agronomic ranges for demonstration only.
// Range format: [idealLow, idealHigh, hardLow, hardHigh]
//   inside ideal range -> score 1
//   between ideal and hard edge -> linear decay to 0
//   beyond hard edge -> score 0 (and caps the crop's category at "Low")

const DATA_LABEL = 'sample, unvalidated';

const SEASONS = ['kharif', 'rabi', 'zaid'];
const SOILS = ['sandy', 'loamy', 'clay', 'silt', 'black', 'red'];

const CROPS = [
  {
    id: 'rice', name: 'Rice',
    ranges: {
      ph: [5.5, 7.0, 4.5, 8.5], n: [60, 120, 20, 200], p: [30, 60, 10, 120], k: [30, 60, 10, 120],
      rainfall: [1000, 2000, 600, 3500], temperature: [22, 32, 15, 40], humidity: [70, 90, 50, 100]
    },
    seasons: ['kharif'], soils: ['clay', 'loamy', 'silt']
  },
  {
    id: 'wheat', name: 'Wheat',
    ranges: {
      ph: [6.0, 7.5, 5.0, 8.5], n: [80, 120, 30, 180], p: [40, 60, 15, 100], k: [30, 50, 10, 100],
      rainfall: [400, 900, 250, 1500], temperature: [12, 22, 5, 30], humidity: [50, 70, 30, 90]
    },
    seasons: ['rabi'], soils: ['loamy', 'clay', 'silt']
  },
  {
    id: 'maize', name: 'Maize',
    ranges: {
      ph: [5.8, 7.2, 4.8, 8.2], n: [80, 140, 30, 220], p: [40, 70, 15, 110], k: [30, 60, 10, 110],
      rainfall: [600, 1100, 400, 1800], temperature: [20, 30, 12, 38], humidity: [55, 75, 35, 90]
    },
    seasons: ['kharif', 'zaid'], soils: ['loamy', 'sandy', 'red']
  },
  {
    id: 'cotton', name: 'Cotton',
    ranges: {
      ph: [6.0, 8.0, 5.0, 9.0], n: [80, 140, 30, 220], p: [30, 60, 10, 100], k: [30, 60, 10, 100],
      rainfall: [600, 1200, 400, 1800], temperature: [21, 32, 15, 40], humidity: [50, 75, 30, 90]
    },
    seasons: ['kharif'], soils: ['black', 'loamy', 'red']
  },
  {
    id: 'sugarcane', name: 'Sugarcane',
    ranges: {
      ph: [6.0, 7.5, 5.0, 8.5], n: [100, 200, 50, 280], p: [40, 80, 15, 120], k: [60, 120, 20, 200],
      rainfall: [1100, 1800, 700, 2500], temperature: [24, 34, 16, 40], humidity: [65, 85, 45, 95]
    },
    seasons: ['kharif', 'zaid'], soils: ['loamy', 'clay', 'black']
  },
  {
    id: 'chickpea', name: 'Chickpea',
    ranges: {
      ph: [6.0, 8.0, 5.0, 9.0], n: [10, 40, 0, 80], p: [30, 60, 10, 100], k: [20, 50, 5, 90],
      rainfall: [300, 700, 200, 1100], temperature: [15, 25, 8, 32], humidity: [30, 55, 20, 75]
    },
    seasons: ['rabi'], soils: ['loamy', 'sandy', 'black']
  },
  {
    id: 'lentil', name: 'Lentil',
    ranges: {
      ph: [6.0, 7.5, 5.0, 8.5], n: [10, 40, 0, 80], p: [30, 60, 10, 100], k: [20, 50, 5, 90],
      rainfall: [300, 600, 200, 1000], temperature: [14, 24, 8, 30], humidity: [35, 60, 20, 80]
    },
    seasons: ['rabi'], soils: ['loamy', 'silt', 'clay']
  },
  {
    id: 'groundnut', name: 'Groundnut',
    ranges: {
      ph: [5.8, 7.0, 4.8, 8.0], n: [10, 40, 0, 80], p: [30, 60, 10, 100], k: [30, 60, 10, 100],
      rainfall: [500, 1000, 350, 1500], temperature: [22, 32, 15, 38], humidity: [50, 75, 35, 90]
    },
    seasons: ['kharif', 'zaid'], soils: ['sandy', 'red', 'loamy']
  },
  {
    id: 'soybean', name: 'Soybean',
    ranges: {
      ph: [6.0, 7.0, 5.0, 8.0], n: [10, 50, 0, 90], p: [40, 70, 15, 110], k: [30, 60, 10, 100],
      rainfall: [600, 1000, 450, 1500], temperature: [20, 30, 14, 36], humidity: [55, 80, 40, 90]
    },
    seasons: ['kharif'], soils: ['loamy', 'black', 'clay']
  },
  {
    id: 'potato', name: 'Potato',
    ranges: {
      ph: [5.0, 6.5, 4.2, 7.5], n: [100, 180, 50, 260], p: [60, 100, 25, 150], k: [100, 180, 50, 260],
      rainfall: [500, 900, 350, 1400], temperature: [14, 22, 8, 28], humidity: [60, 80, 40, 92]
    },
    seasons: ['rabi'], soils: ['loamy', 'sandy', 'silt']
  },
  {
    id: 'tomato', name: 'Tomato',
    ranges: {
      ph: [6.0, 7.0, 5.0, 8.0], n: [80, 150, 30, 220], p: [50, 90, 20, 140], k: [80, 150, 30, 220],
      rainfall: [600, 1100, 400, 1600], temperature: [18, 28, 10, 35], humidity: [55, 75, 40, 90]
    },
    seasons: ['rabi', 'zaid'], soils: ['loamy', 'sandy', 'red']
  },
  {
    id: 'pearl-millet', name: 'Pearl millet',
    ranges: {
      ph: [6.0, 8.0, 5.0, 9.0], n: [30, 70, 10, 120], p: [20, 40, 5, 70], k: [20, 40, 5, 70],
      rainfall: [250, 600, 150, 900], temperature: [25, 35, 18, 42], humidity: [30, 55, 15, 75]
    },
    seasons: ['kharif'], soils: ['sandy', 'red', 'loamy']
  }
];

module.exports = { CROPS, SEASONS, SOILS, DATA_LABEL };
