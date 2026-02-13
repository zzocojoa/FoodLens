import { useQuery } from '@tanstack/react-query';
import { lookupBarcode } from '@/services/ai';

export const barcodeKeys = {
  all: ['barcode'] as const,
  lookup: (barcode: string) => [...barcodeKeys.all, barcode] as const,
};

/**
 * Hook for looking up barcode information
 */
export const useBarcodeLookupQuery = (barcode: string, enabled: boolean = false) => {
  return useQuery({
    queryKey: barcodeKeys.lookup(barcode),
    queryFn: () => lookupBarcode(barcode),
    enabled: enabled && !!barcode,
    // Barcode lookup results are generally static for a given code
    staleTime: Infinity,
  });
};
