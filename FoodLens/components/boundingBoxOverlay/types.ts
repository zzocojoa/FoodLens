export interface BoundingBoxIngredient {
  name: string;
  isAllergen: boolean;
  box_2d?: number[];
}

export interface BoundingBoxOverlayProps {
  imageWidth: number;
  imageHeight: number;
  ingredients: BoundingBoxIngredient[];
}

export interface BoundingBoxRenderItem {
  key: string;
  name: string;
  isAllergen: boolean;
  frame: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}
