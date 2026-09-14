/**
 * Client-Side Barcode Scale Parser (GS1 Type 20/21)
 * Automatically detects whether a 13-digit barcode came from an electronic scale
 * (e.g. Deli, Meat, Cheese, Vegetables) and extracts PLU and weight in 0ms.
 */

export function parseScaleBarcode(rawCode) {
  if (!rawCode || typeof rawCode !== 'string') {
    return { isScaleBarcode: false };
  }

  const clean = rawCode.trim();

  // GS1 Scale Barcodes are strictly 13 digits starting with 20 or 21
  if (clean.length === 13 && (clean.startsWith('20') || clean.startsWith('21'))) {
    const prefix = clean.substring(0, 2);
    // 5 digits for PLU item code
    const itemCode = parseInt(clean.substring(2, 7), 10).toString();
    // 5 digits for value: in Type 20/21, usually represents grams (e.g., 00450 = 450 grams = 0.450 kg)
    const rawVal = parseInt(clean.substring(7, 12), 10);
    const weightInKg = parseFloat((rawVal / 1000).toFixed(3));

    return {
      isScaleBarcode: true,
      prefix,
      itemCode,
      weight: weightInKg > 0 ? weightInKg : 1,
      rawCode: clean
    };
  }

  return {
    isScaleBarcode: false,
    rawCode: clean
  };
}
