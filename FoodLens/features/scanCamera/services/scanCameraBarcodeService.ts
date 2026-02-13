import { lookupBarcode } from '../../../services/ai';

export const lookupBarcodeWithCache = async (barcode: string) => {
  const { BarcodeCache } = await import('../../../services/aiCore/internal/barcodeCache');
  const cachedResult = await BarcodeCache.get(barcode);

  if (cachedResult) {
    console.log('[AI] Barcode found in cache:', barcode);
    return cachedResult;
  }

  const result = await lookupBarcode(barcode);
  if (result.found) {
    await BarcodeCache.set(barcode, result);
  }
  return result;
};

export const normalizeBarcodeIngredients = (product: any) => {
  if (!product?.ingredients || product.ingredients.length === 0) {
    return product;
  }

  if (typeof product.ingredients[0] !== 'string') {
    return product;
  }

  return {
    ...product,
    ingredients: product.ingredients.map((ing: string) => ({
      name: ing,
      isAllergen: false,
    })),
  };
};
