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
