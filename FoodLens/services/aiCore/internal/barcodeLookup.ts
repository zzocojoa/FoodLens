import { getAllergyString } from '../allergy';
import { mapBarcodeToAnalyzedData } from '../mappers';
import { ServerConfig } from '../serverConfig';
import { BarcodeLookupResult } from '../types';

export const lookupBarcodeWithAllergyContext = async (
  barcode: string,
): Promise<BarcodeLookupResult> => {
  const activeServerUrl = await ServerConfig.getServerUrl();
  const allergyString = await getAllergyString();
  console.log('[AI] Barcode lookup with allergies:', allergyString);

  const formData = new FormData();
  formData.append('barcode', barcode);
  formData.append('allergy_info', allergyString);

  const response = await fetch(`${activeServerUrl}/lookup/barcode`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }

  const result = await response.json();
  if (result.found && result.data) {
    result.data = mapBarcodeToAnalyzedData(result.data);
    result.data.isBarcode = true;
  }

  return result;
};

