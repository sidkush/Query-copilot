export interface NumberFormatDefault {
  readonly name: string;
  readonly pattern: string;
  readonly description: string;
}

export const DEFAULT_NUMBER_FORMATS: readonly NumberFormatDefault[] = [
  { name: 'Number (Standard)', pattern: '#,##0', description: 'Integer with thousands separator' },
  { name: 'Number (Decimal)', pattern: '#,##0.00', description: 'Two fixed decimals with thousands separator' },
  { name: 'Currency (Standard)', pattern: '$#,##0.00;($#,##0.00)', description: 'USD with parenthesised negatives' },
  { name: 'Currency (Custom)', pattern: '[USD]#,##0.00', description: 'Bracketed ISO code prefix' },
  { name: 'Scientific', pattern: '0.##E+00', description: 'Scientific notation' },
  { name: 'Percentage', pattern: '0.0%', description: 'One-decimal percentage' },
] as const;
