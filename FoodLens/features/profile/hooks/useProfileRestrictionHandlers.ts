import { MutableRefObject, useCallback } from 'react';
import { SEARCHABLE_INGREDIENTS } from '@/data/ingredients';
import { addUniqueItem, removeStringItem, toggleStringItem } from '../utils/profileSelection';
import {
  IngredientSuggestion,
  buildSuggestions,
  createCustomRestrictionValue,
  resolveSuggestionStorageValue,
} from '../utils/profileSuggestions';

type UseProfileRestrictionHandlersParams = {
  inputValue: string;
  otherRestrictions: string[];
  setInputValue: (value: string) => void;
  setSuggestions: (value: IngredientSuggestion[]) => void;
  setAllergies: React.Dispatch<React.SetStateAction<string[]>>;
  setOtherRestrictions: React.Dispatch<React.SetStateAction<string[]>>;
  shouldScrollRef: MutableRefObject<boolean>;
  t: (key: string, fallback: string) => string;
};

export const useProfileRestrictionHandlers = ({
  inputValue,
  otherRestrictions,
  setInputValue,
  setSuggestions,
  setAllergies,
  setOtherRestrictions,
  shouldScrollRef,
  t,
}: UseProfileRestrictionHandlersParams) => {
  const toggleAllergen = useCallback(
    (id: string) => {
      setAllergies((prev) => toggleStringItem(prev, id));
    },
    [setAllergies]
  );

  const addItemToRestrictions = useCallback(
    (text: string) => {
      const item = text.trim();
      if (!item) {
        return;
      }

      setOtherRestrictions((prev) => {
        const next = addUniqueItem(prev, item);
        if (next.length !== prev.length) {
          shouldScrollRef.current = true;
        }
        return next;
      });

      setInputValue('');
      setSuggestions([]);
    },
    [setInputValue, setOtherRestrictions, setSuggestions, shouldScrollRef]
  );

  const addOtherRestriction = useCallback(() => {
    const item = inputValue.trim();
    if (!item) {
      return;
    }
    addItemToRestrictions(createCustomRestrictionValue(item));
  }, [addItemToRestrictions, inputValue]);

  const removeRestriction = useCallback(
    (item: string) => {
      setOtherRestrictions((prev) => removeStringItem(prev, item));
    },
    [setOtherRestrictions]
  );

  const handleInputChange = useCallback(
    (text: string) => {
      setInputValue(text);
      setSuggestions(buildSuggestions({
        keyword: text,
        searchable: SEARCHABLE_INGREDIENTS,
        selected: otherRestrictions,
        limit: 5,
        translate: t,
      }));
    },
    [otherRestrictions, setInputValue, setSuggestions, t]
  );

  const selectSuggestion = useCallback(
    (item: string) => {
      addItemToRestrictions(resolveSuggestionStorageValue(item));
    },
    [addItemToRestrictions]
  );

  return {
    toggleAllergen,
    addOtherRestriction,
    removeRestriction,
    handleInputChange,
    selectSuggestion,
  };
};
