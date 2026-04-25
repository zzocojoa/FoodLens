import { act, renderHook } from '@testing-library/react-native';
import { useRef, useState } from 'react';
import { IngredientSuggestion } from '../../utils/profileSuggestions';
import { useProfileRestrictionHandlers } from '../useProfileRestrictionHandlers';

const translate = (_key: string, fallback: string): string => fallback;

describe('useProfileRestrictionHandlers', () => {
  it('stores canonical suggestion values when a suggestion is selected', () => {
    const { result } = renderHook(() => {
      const shouldScrollRef = useRef(false);
      const [inputValue, setInputValue] = useState('복숭아');
      const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);
      const [allergies, setAllergies] = useState<string[]>([]);
      const [otherRestrictions, setOtherRestrictions] = useState<string[]>([]);
      const handlers = useProfileRestrictionHandlers({
        inputValue,
        otherRestrictions,
        setInputValue,
        setSuggestions,
        setAllergies,
        setOtherRestrictions,
        shouldScrollRef,
        t: translate,
      });

      return { handlers, inputValue, suggestions, allergies, otherRestrictions };
    });

    act(() => {
      result.current.handlers.selectSuggestion('peach');
    });

    expect(result.current.otherRestrictions).toEqual(['peach']);
    expect(result.current.inputValue).toBe('');
    expect(result.current.suggestions).toEqual([]);
  });

  it('stores direct free-text restrictions as custom values', () => {
    const { result } = renderHook(() => {
      const shouldScrollRef = useRef(false);
      const [inputValue, setInputValue] = useState('my custom restriction');
      const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);
      const [allergies, setAllergies] = useState<string[]>([]);
      const [otherRestrictions, setOtherRestrictions] = useState<string[]>([]);
      const handlers = useProfileRestrictionHandlers({
        inputValue,
        otherRestrictions,
        setInputValue,
        setSuggestions,
        setAllergies,
        setOtherRestrictions,
        shouldScrollRef,
        t: translate,
      });

      return { handlers, allergies, otherRestrictions };
    });

    act(() => {
      result.current.handlers.addOtherRestriction();
    });

    expect(result.current.otherRestrictions).toEqual(['custom:my custom restriction']);
  });
});
