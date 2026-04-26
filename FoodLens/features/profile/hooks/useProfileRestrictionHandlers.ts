import { MutableRefObject, useCallback } from 'react';
import { SEARCHABLE_INGREDIENTS } from '@/data/ingredients';
import { addUniqueItem, removeStringItem, toggleStringItem } from '../utils/profileSelection';
import { AllergySeverity } from '../types/profile.types';
import {
  IngredientSuggestion,
  buildSuggestions,
  createCustomRestrictionValue,
  resolveSuggestionStorageValue,
} from '../utils/profileSuggestions';

type UseProfileRestrictionHandlersParams = {
  inputValue: string;
  allergies: string[];
  otherRestrictions: string[];
  setInputValue: (value: string) => void;
  setSuggestions: (value: IngredientSuggestion[]) => void;
  setAllergies: React.Dispatch<React.SetStateAction<string[]>>;
  setOtherRestrictions: React.Dispatch<React.SetStateAction<string[]>>;
  setSeverityMap: React.Dispatch<React.SetStateAction<Record<string, AllergySeverity>>>;
  shouldScrollRef: MutableRefObject<boolean>;
  hasLocalEditsRef: MutableRefObject<boolean>;
  t: (key: string, fallback: string) => string;
};

export const useProfileRestrictionHandlers = ({
  inputValue,
  allergies,
  otherRestrictions,
  setInputValue,
  setSuggestions,
  setAllergies,
  setOtherRestrictions,
  setSeverityMap,
  shouldScrollRef,
  hasLocalEditsRef,
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
          hasLocalEditsRef.current = true;
          shouldScrollRef.current = true;
          setSeverityMap((map) => ({ ...map, [item]: map[item] ?? 'moderate' }));
        }
        return next;
      });

      setInputValue('');
      setSuggestions([]);
    },
    [hasLocalEditsRef, setInputValue, setOtherRestrictions, setSeverityMap, setSuggestions, shouldScrollRef]
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
      setOtherRestrictions((prev) => {
        const next = removeStringItem(prev, item);
        if (next.length !== prev.length) {
          hasLocalEditsRef.current = true;
          if (!allergies.includes(item)) {
            setSeverityMap((map) => {
              const nextMap = { ...map };
              delete nextMap[item];
              return nextMap;
            });
          }
        }
        return next;
      });
    },
    [allergies, hasLocalEditsRef, setOtherRestrictions, setSeverityMap]
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
