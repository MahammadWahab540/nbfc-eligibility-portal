/**
 * Indian Bank IFSC Prefix Registry and Institutional Categorization
 * Maps 4-letter IFSC bank prefixes and textual bank names to regulatory classifications:
 * - PUBLIC_SECTOR (PSU / Nationalised)
 * - PRIVATE_SECTOR (Scheduled Commercial Private Bank)
 * - REGIONAL_RURAL (Grameena / RRB)
 * - COOPERATIVE (Urban / State Co-operative Bank)
 * - UNKNOWN
 */

const BANK_IFSC_MAP = {
  // Public Sector / Nationalised Banks
  'SBIN': { name: 'State Bank of India', category: 'PUBLIC_SECTOR', is_nationalised: true },
  'CNRB': { name: 'Canara Bank', category: 'PUBLIC_SECTOR', is_nationalised: true },
  'UBIN': { name: 'Union Bank of India', category: 'PUBLIC_SECTOR', is_nationalised: true },
  'IDIB': { name: 'Indian Bank', category: 'PUBLIC_SECTOR', is_nationalised: true },
  'BARB': { name: 'Bank of Baroda', category: 'PUBLIC_SECTOR', is_nationalised: true },
  'IOBA': { name: 'Indian Overseas Bank', category: 'PUBLIC_SECTOR', is_nationalised: true },
  'BKID': { name: 'Bank of India', category: 'PUBLIC_SECTOR', is_nationalised: true },
  'MAHB': { name: 'Bank of Maharashtra', category: 'PUBLIC_SECTOR', is_nationalised: true },
  'PUNB': { name: 'Punjab National Bank', category: 'PUBLIC_SECTOR', is_nationalised: true },
  'CBIN': { name: 'Central Bank of India', category: 'PUBLIC_SECTOR', is_nationalised: true },
  'PSIB': { name: 'Punjab & Sind Bank', category: 'PUBLIC_SECTOR', is_nationalised: true },
  'UCBA': { name: 'UCO Bank', category: 'PUBLIC_SECTOR', is_nationalised: true },

  // Scheduled Commercial Private Banks
  'HDFC': { name: 'HDFC Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'ICIC': { name: 'ICICI Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'UTIB': { name: 'Axis Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'KKBK': { name: 'Kotak Mahindra Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'IBKL': { name: 'IDBI Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'KVBL': { name: 'Karur Vysya Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'FDRL': { name: 'Federal Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'KARB': { name: 'Karnataka Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'CIUB': { name: 'City Union Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'TMBL': { name: 'Tamilnad Mercantile Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'YESB': { name: 'Yes Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'IDFB': { name: 'IDFC First Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'BDBL': { name: 'Bandhan Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'AUBL': { name: 'AU Small Finance Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'ESFB': { name: 'Equitas Small Finance Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'DBSS': { name: 'DBS Bank India', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'DLXB': { name: 'Dhanlaxmi Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'SIBL': { name: 'South Indian Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'INDB': { name: 'IndusInd Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'RBLB': { name: 'RBL Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },
  'CSBK': { name: 'CSB Bank', category: 'PRIVATE_SECTOR', is_nationalised: false },

  // Regional Rural Banks (RRBs / Grameena)
  'KVGB': { name: 'Karnataka Vikas Grameena Bank', category: 'REGIONAL_RURAL', is_nationalised: false },
  'APGB': { name: 'Andhra Pragathi Grameena Bank', category: 'REGIONAL_RURAL', is_nationalised: false },
  'APGV': { name: 'Andhra Pradesh Grameena Vikas Bank', category: 'REGIONAL_RURAL', is_nationalised: false },
  'TGBX': { name: 'Telangana Grameena Bank', category: 'REGIONAL_RURAL', is_nationalised: false },
  'MGBX': { name: 'Maharashtra Gramin Bank', category: 'REGIONAL_RURAL', is_nationalised: false },
  'PGBX': { name: 'Prathama Gramin Bank', category: 'REGIONAL_RURAL', is_nationalised: false },

  // Co-operative / Non-scheduled Banks
  'NCBL': { name: 'National Co-operative Bank', category: 'COOPERATIVE', is_nationalised: false },
  'CNSX': { name: 'Citizen Co-operative Bank', category: 'COOPERATIVE', is_nationalised: false },
  'SVCB': { name: 'SVC Co-operative Bank', category: 'COOPERATIVE', is_nationalised: false },
  'COOP': { name: 'Co-operative Bank', category: 'COOPERATIVE', is_nationalised: false }
};

/**
 * Classifies bank input (IFSC prefix or name) into institutional structure.
 * Returns { raw, code, name, category, is_nationalised, is_unknown }
 */
function classifyBank(rawBank) {
  if (!rawBank || typeof rawBank !== 'string') {
    return {
      raw: null,
      code: null,
      name: 'Unspecified Bank',
      category: 'UNKNOWN',
      is_nationalised: null,
      is_unknown: true
    };
  }

  const clean = rawBank.trim().toUpperCase();

  if (clean === 'OTHER' || clean === 'UNKNOWN' || clean === '') {
    return {
      raw: rawBank,
      code: 'OTHER',
      name: 'Other / Unspecified Bank',
      category: 'UNKNOWN',
      is_nationalised: null,
      is_unknown: true
    };
  }

  // Exact 4-char IFSC lookup
  if (BANK_IFSC_MAP[clean]) {
    const entry = BANK_IFSC_MAP[clean];
    return {
      raw: rawBank,
      code: clean,
      name: entry.name,
      category: entry.category,
      is_nationalised: entry.is_nationalised,
      is_unknown: false
    };
  }

  // Substring checks for cooperative / gramin names
  if (clean.includes('COOPERATIVE') || clean.includes('CO-OPERATIVE') || clean.includes('COOP')) {
    return {
      raw: rawBank,
      code: clean,
      name: rawBank,
      category: 'COOPERATIVE',
      is_nationalised: false,
      is_unknown: false
    };
  }

  if (clean.includes('GRAMIN') || clean.includes('GRAMEENA') || clean.includes('RRB')) {
    return {
      raw: rawBank,
      code: clean,
      name: rawBank,
      category: 'REGIONAL_RURAL',
      is_nationalised: false,
      is_unknown: false
    };
  }

  if (clean.includes('STATE BANK') || clean.includes('SBI') || clean.includes('CANARA') ||
      clean.includes('UNION BANK') || clean.includes('BANK OF BARODA') || clean.includes('INDIAN BANK')) {
    return {
      raw: rawBank,
      code: clean,
      name: rawBank,
      category: 'PUBLIC_SECTOR',
      is_nationalised: true,
      is_unknown: false
    };
  }

  // Default unrecognized bank
  return {
    raw: rawBank,
    code: clean,
    name: rawBank,
    category: 'UNKNOWN',
    is_nationalised: null,
    is_unknown: true
  };
}

module.exports = {
  BANK_IFSC_MAP,
  classifyBank
};
