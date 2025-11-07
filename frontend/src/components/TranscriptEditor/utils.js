// TranscriptEditor/utils.js - Utility and helper functions

import { TICKER_TO_DOMAIN } from './constants';

/**
 * Get company domain for a given ticker symbol
 */
export const getCompanyDomain = (ticker) => {
  return TICKER_TO_DOMAIN[ticker] || ticker.toLowerCase();
};

/**
 * Get ticker logo URL from Clearbit API
 */
export const getTickerLogo = (ticker) => {
  return `https://logo.clearbit.com/${getCompanyDomain(ticker)}.com`;
};

/**
 * Normalize array of strings to uppercase and remove duplicates
 */
export const normalizeToUppercase = (arr) => {
  return Array.from(new Set((arr || []).map(t => (t || '').toUpperCase()))).filter(Boolean);
};

/**
 * Merge two arrays and remove duplicates
 */
export const mergeUnique = (arr1, arr2) => {
  return Array.from(new Set([...(arr1 || []), ...(arr2 || [])]));
};

/**
 * Check if annotation text is used in any annotations
 */
export const isUsedInAnnotations = (value, annotations, field) => {
  return annotations.filter(a => {
    if (!a[field]) return false;
    const values = a[field].split(',').map(v => v.trim().toUpperCase());
    return values.includes(value.toUpperCase());
  });
};
