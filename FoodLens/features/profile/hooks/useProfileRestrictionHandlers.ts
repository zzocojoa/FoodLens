import { MutableRefObject, useCallback } from 'react';
import { SEARCHABLE_INGREDIENTS } from '@/data/ingredients';
import { addUniqueItem, removeStringItem, toggleStringItem } from '../utils/profileSelection';
import { buildSuggestions } from '../utils/profileSuggestions';

type UseProfileRestrictionHandlersParams = {
  inputValue: string;
  otherRestrictions: string[];
  setInputValue: (value: string) => void;
  setSuggestions: (value: string[]) => void;
  setAllergies: React.Dispatch<React.SetStateAction<string[]>>;
  setOtherRestrictions: React.Dispatch<React.SetStateAction<string[]>>;
  shouldScrollRef: MutableRefObject<boolean>;
};

export const useProfileRestrictionHandlers = ({
  inputValue,
  otherRestrictions,
  setInputValue,
  setSuggestions,
  setAllergies,
  setOtherRestrictions,
  shouldScrollRef,
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
    addItemToRestrictions(inputValue);
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
      setSuggestions(buildSuggestions(text, SEARCHABLE_INGREDIENTS, otherRestrictions));
    },
    [otherRestrictions, setInputValue, setSuggestions]
  );

  const selectSuggestion = useCallback(
    (item: string) => {
      addItemToRestrictions(item);
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
