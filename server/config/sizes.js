/**
 * General sneaker size chart. The EU size is what KicksHub picks and ships.
 * UK / US columns are a guide — brands disagree by about half a size.
 */
const SIZE_GUIDE_NOTE =
  'EU is the size we pack. UK and US equivalents are a general sneaker conversion and can differ by brand. When you are between sizes, go up.';

const SIZE_CHART = [
  { eu: '35', uk: '2.5', usMen: '3.5', usWomen: '5' },
  { eu: '35.5', uk: '3', usMen: '4', usWomen: '5.5' },
  { eu: '36', uk: '3.5', usMen: '4.5', usWomen: '6' },
  { eu: '36.5', uk: '4', usMen: '5', usWomen: '6.5' },
  { eu: '37', uk: '4.5', usMen: '5', usWomen: '6.5' },
  { eu: '37.5', uk: '4.5', usMen: '5.5', usWomen: '7' },
  { eu: '38', uk: '5', usMen: '6', usWomen: '7.5' },
  { eu: '38.5', uk: '5.5', usMen: '6.5', usWomen: '8' },
  { eu: '39', uk: '6', usMen: '6.5', usWomen: '8.5' },
  { eu: '39.5', uk: '6', usMen: '7', usWomen: '8.5' },
  { eu: '40', uk: '6', usMen: '7', usWomen: '9' },
  { eu: '40.5', uk: '6.5', usMen: '7.5', usWomen: '9.5' },
  { eu: '41', uk: '7', usMen: '8', usWomen: '10' },
  { eu: '41.5', uk: '7.5', usMen: '8.5', usWomen: '10.5' },
  { eu: '42', uk: '8', usMen: '9', usWomen: '11' },
  { eu: '42.5', uk: '8.5', usMen: '9.5', usWomen: '11.5' },
  { eu: '43', uk: '9', usMen: '10', usWomen: '12' },
  { eu: '44', uk: '9.5', usMen: '10.5', usWomen: '12.5' },
  { eu: '44.5', uk: '10', usMen: '11', usWomen: '13' },
  { eu: '45', uk: '10.5', usMen: '11.5', usWomen: '13.5' },
  { eu: '45.5', uk: '11', usMen: '12', usWomen: '14' },
  { eu: '46', uk: '11', usMen: '12', usWomen: '14' },
  { eu: '47', uk: '12', usMen: '13', usWomen: '15' },
];

function lookupSize(eu) {
  const row = SIZE_CHART.find((entry) => entry.eu === String(eu));
  if (!row) {
    const error = new Error(`Unknown EU size: ${eu}`);
    error.statusCode = 400;
    throw error;
  }
  return row;
}

function getSizeChart() {
  return {
    note: SIZE_GUIDE_NOTE,
    unit: 'EU',
    rows: SIZE_CHART,
  };
}

module.exports = { SIZE_CHART, SIZE_GUIDE_NOTE, lookupSize, getSizeChart };
