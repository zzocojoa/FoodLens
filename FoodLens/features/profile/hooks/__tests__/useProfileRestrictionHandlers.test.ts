import { act, renderHook } from '@testing-library/react-native';
import { useRef, useState } from 'react';
import { AllergySeverity } from '../../types/profile.types';
import { IngredientSuggestion } from '../../utils/profileSuggestions';
import { useProfileRestrictionHandlers } from '../useProfileRestrictionHandlers';

const translate = (_key: string, fallback: string): string => fallback;

describe('useProfileRestrictionHandlers', () => {
  it('stores canonical suggestion values when a suggestion is selected', () => {
    const { result } = renderHook(() => {
      const shouldScrollRef = useRef(false);
      const hasLocalEditsRef = useRef(false);
      const [inputValue, setInputValue] = useState('복숭아');
      const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);
      const [allergies, setAllergies] = useState<string[]>([]);
      const [otherRestrictions, setOtherRestrictions] = useState<string[]>([]);
      const [severityMap, setSeverityMap] = useState<Record<string, AllergySeverity>>({});
      const handlers = useProfileRestrictionHandlers({
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
        t: translate,
      });

      return { handlers, inputValue, suggestions, allergies, otherRestrictions, severityMap, hasLocalEditsRef };
    });

    act(() => {
      result.current.handlers.selectSuggestion('peach');
    });

    expect(result.current.otherRestrictions).toEqual(['peach']);
    expect(result.current.inputValue).toBe('');
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.severityMap['peach']).toBe('moderate');
    expect(result.current.hasLocalEditsRef.current).toBe(true);
  });

  it('stores direct free-text restrictions as custom values', () => {
    const { result } = renderHook(() => {
      const shouldScrollRef = useRef(false);
      const hasLocalEditsRef = useRef(false);
      const [inputValue, setInputValue] = useState('my custom restriction');
      const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);
      const [allergies, setAllergies] = useState<string[]>([]);
      const [otherRestrictions, setOtherRestrictions] = useState<string[]>([]);
      const [severityMap, setSeverityMap] = useState<Record<string, AllergySeverity>>({});
      const handlers = useProfileRestrictionHandlers({
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
        t: translate,
      });

      return { handlers, allergies, otherRestrictions, severityMap, hasLocalEditsRef };
    });

    act(() => {
      result.current.handlers.addOtherRestriction();
    });

    expect(result.current.otherRestrictions).toEqual(['custom:my custom restriction']);
    expect(result.current.severityMap['custom:my custom restriction']).toBe('moderate');
    expect(result.current.hasLocalEditsRef.current).toBe(true);
  });

  it('removes restrictions by stored value and marks local edits', () => {
    const { result } = renderHook(() => {
      const shouldScrollRef = useRef(false);
      const hasLocalEditsRef = useRef(false);
      const [inputValue, setInputValue] = useState('');
      const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);
      const [allergies, setAllergies] = useState<string[]>([]);
      const [otherRestrictions, setOtherRestrictions] = useState<string[]>([
        'peach',
        'custom:my custom restriction',
      ]);
      const [severityMap, setSeverityMap] = useState<Record<string, AllergySeverity>>({
        peach: 'severe',
        'custom:my custom restriction': 'mild',
      });
      const handlers = useProfileRestrictionHandlers({
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
        t: translate,
      });

      return { handlers, otherRestrictions, severityMap, hasLocalEditsRef };
    });

    act(() => {
      result.current.handlers.removeRestriction('peach');
    });

    expect(result.current.otherRestrictions).toEqual(['custom:my custom restriction']);
    expect(result.current.severityMap['peach']).toBeUndefined();
    expect(result.current.severityMap['custom:my custom restriction']).toBe('mild');
    expect(result.current.hasLocalEditsRef.current).toBe(true);
  });

  it('keeps shared severity when removing an other restriction that is still an allergy', () => {
    const { result } = renderHook(() => {
      const shouldScrollRef = useRef(false);
      const hasLocalEditsRef = useRef(false);
      const [inputValue, setInputValue] = useState('');
      const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);
      const [allergies, setAllergies] = useState<string[]>(['peach']);
      const [otherRestrictions, setOtherRestrictions] = useState<string[]>(['peach']);
      const [severityMap, setSeverityMap] = useState<Record<string, AllergySeverity>>({
        peach: 'severe',
      });
      const handlers = useProfileRestrictionHandlers({
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
        t: translate,
      });

      return { handlers, otherRestrictions, severityMap, hasLocalEditsRef };
    });

    act(() => {
      result.current.handlers.removeRestriction('peach');
    });

    expect(result.current.otherRestrictions).toEqual([]);
    expect(result.current.severityMap['peach']).toBe('severe');
    expect(result.current.hasLocalEditsRef.current).toBe(true);
  });
});
