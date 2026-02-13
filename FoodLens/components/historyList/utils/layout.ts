const BASE_BOTTOM_PADDING = 40;
const EDIT_MODE_BOTTOM_PADDING = 140;
export const HORIZONTAL_PADDING = 24;

export const getListPaddingBottom = (isEditMode: boolean, selectedCount: number): number => {
  if (isEditMode && selectedCount > 0) {
    return EDIT_MODE_BOTTOM_PADDING;
  }
  return BASE_BOTTOM_PADDING;
};
