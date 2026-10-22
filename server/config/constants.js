/**
 * Ghana's 16 regions, ordered the way a checkout dropdown should read:
 * Accra and Kumasi first, then the rest of the south, then the north.
 * Fees are in Ghana cedis (GHS), not pesewas.
 */
const DELIVERY_FEES = [
  { region: 'Greater Accra', standardFee: 20, expressFee: 40, standardDays: '1–2 days', expressDays: 'Same day' },
  { region: 'Ashanti', standardFee: 35, expressFee: 65, standardDays: '2–4 days', expressDays: '1–2 days' },
  { region: 'Central', standardFee: 30, expressFee: 55, standardDays: '2–3 days', expressDays: '1–2 days' },
  { region: 'Eastern', standardFee: 30, expressFee: 55, standardDays: '2–3 days', expressDays: '1–2 days' },
  { region: 'Western', standardFee: 40, expressFee: 70, standardDays: '3–5 days', expressDays: '2–3 days' },
  { region: 'Western North', standardFee: 50, expressFee: 85, standardDays: '3–6 days', expressDays: '2–4 days' },
  { region: 'Volta', standardFee: 40, expressFee: 70, standardDays: '3–5 days', expressDays: '2–3 days' },
  { region: 'Oti', standardFee: 55, expressFee: 90, standardDays: '4–6 days', expressDays: '3–4 days' },
  { region: 'Bono', standardFee: 45, expressFee: 75, standardDays: '3–5 days', expressDays: '2–3 days' },
  { region: 'Bono East', standardFee: 45, expressFee: 75, standardDays: '3–5 days', expressDays: '2–3 days' },
  { region: 'Ahafo', standardFee: 50, expressFee: 85, standardDays: '3–6 days', expressDays: '2–4 days' },
  { region: 'Northern', standardFee: 60, expressFee: 100, standardDays: '4–7 days', expressDays: '3–5 days' },
  { region: 'Savannah', standardFee: 65, expressFee: 110, standardDays: '5–7 days', expressDays: '3–5 days' },
  { region: 'North East', standardFee: 70, expressFee: 115, standardDays: '5–8 days', expressDays: '4–6 days' },
  { region: 'Upper East', standardFee: 75, expressFee: 120, standardDays: '5–8 days', expressDays: '4–6 days' },
  { region: 'Upper West', standardFee: 75, expressFee: 120, standardDays: '5–8 days', expressDays: '4–6 days' },
];

const GHANA_REGIONS = DELIVERY_FEES.map((row) => row.region);

const MAJOR_CITIES = {
  'Greater Accra': ['Accra', 'Tema', 'Madina', 'Ashaiman', 'Dansoman', 'Teshie', 'Nungua', 'Adenta', 'Legon'],
  Ashanti: ['Kumasi', 'Obuasi', 'Ejisu', 'Konongo', 'Mampong', 'Tafo'],
  Central: ['Cape Coast', 'Kasoa', 'Winneba', 'Mankessim', 'Elmina'],
  Eastern: ['Koforidua', 'Nkawkaw', 'Akropong', 'Suhum'],
  Western: ['Takoradi', 'Sekondi', 'Tarkwa'],
  'Western North': ['Sefwi Wiawso', 'Bibiani', 'Enchi'],
  Volta: ['Ho', 'Hohoe', 'Keta', 'Aflao'],
  Oti: ['Dambai', 'Jasikan', 'Nkwanta'],
  Bono: ['Sunyani', 'Berekum', 'Dormaa Ahenkro'],
  'Bono East': ['Techiman', 'Kintampo', 'Atebubu'],
  Ahafo: ['Goaso', 'Bechem', 'Duayaw Nkwanta'],
  Northern: ['Tamale', 'Yendi', 'Savelugu'],
  Savannah: ['Damongo', 'Bole', 'Salaga'],
  'North East': ['Nalerigu', 'Walewale', 'Gambaga'],
  'Upper East': ['Bolgatanga', 'Bawku', 'Navrongo'],
  'Upper West': ['Wa', 'Tumu', 'Lawra'],
};

/**
 * Paystack Ghana mobile-money provider codes.
 * Telecel (formerly Vodafone Cash) is still `vod` on Paystack.
 * Prefixes are a hint only — number porting means the network can disagree.
 */
const MOMO_NETWORKS = [
  {
    id: 'mtn',
    label: 'MTN MoMo',
    paystackProvider: 'mtn',
    prefixes: ['024', '054', '055', '059'],
  },
  {
    id: 'telecel',
    label: 'Telecel Cash',
    paystackProvider: 'vod',
    prefixes: ['020', '050'],
  },
  {
    id: 'airteltigo',
    label: 'AirtelTigo Money',
    paystackProvider: 'atl',
    prefixes: ['027', '057', '026', '056'],
  },
];

const ROLES = ['customer', 'admin'];
const GENDERS = ['men', 'women', 'unisex', 'kids'];
const ORDER_STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];
const TIMELINE_STATUSES = [...ORDER_STATUSES, 'note', 'payment_failed', 'refund'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];
const PAYMENT_CHANNELS = ['card', 'mobile_money', 'pay_on_delivery'];
const DELIVERY_METHODS = ['standard', 'express'];
const PROMO_TYPES = ['percentage', 'fixed'];
const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];
const STOCK_STATES = ['pending', 'reserved', 'committing', 'committed', 'released'];
const TRANSACTION_STATUSES = ['pending', 'success', 'failed', 'abandoned'];

const ORDER_TRANSITIONS = {
  pending: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

const CURRENCY = { code: 'GHS', symbol: '₵', minorUnit: 100 };
const MAX_LINE_QUANTITY = 10;
const MAX_ORDER_LINES = 20;
const LOW_STOCK_DEFAULT = 3;

module.exports = {
  DELIVERY_FEES,
  GHANA_REGIONS,
  MAJOR_CITIES,
  MOMO_NETWORKS,
  ROLES,
  GENDERS,
  ORDER_STATUSES,
  TIMELINE_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_CHANNELS,
  DELIVERY_METHODS,
  PROMO_TYPES,
  REVIEW_STATUSES,
  STOCK_STATES,
  TRANSACTION_STATUSES,
  ORDER_TRANSITIONS,
  CURRENCY,
  MAX_LINE_QUANTITY,
  MAX_ORDER_LINES,
  LOW_STOCK_DEFAULT,
};
