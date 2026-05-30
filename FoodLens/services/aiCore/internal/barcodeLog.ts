export const maskBarcodeForLog = (barcode: string): string => {
  const normalizedBarcode = barcode.trim();
  if (!normalizedBarcode) return 'unknown';
  if (normalizedBarcode.length <= 4) return '***';
  return `***${normalizedBarcode.slice(-4)}`;
};
