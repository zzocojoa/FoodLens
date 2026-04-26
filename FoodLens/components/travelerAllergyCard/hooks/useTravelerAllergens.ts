import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { UserService } from '@/services/userService';
import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser';
import { subscribeUserProfileUpdated } from '@/services/user/userProfileStore';
import type { UserProfileUpdateReason } from '@/services/user/userProfileStore';

type TravelerAllergensProviderProps = Readonly<{
  allergens: string[];
  children?: ReactNode;
}>;

const TravelerAllergensContext = createContext<string[] | null>(null);

const shouldRefreshTravelerAllergens = (reason: UserProfileUpdateReason): boolean => {
  return reason !== 'client_state_write';
};

export const TravelerAllergensProvider = (
  props: TravelerAllergensProviderProps
): ReactElement => {
  return createElement(
    TravelerAllergensContext.Provider,
    { value: props.allergens },
    props.children
  );
};

export const useTravelerAllergens = (): string[] => {
  const providedAllergens = useContext(TravelerAllergensContext);
  const [allergens, setAllergens] = useState<string[]>([]);

  useEffect(() => {
    if (providedAllergens !== null) {
      return undefined;
    }

    const userId = getCurrentUserIdSnapshot();
    if (!userId || userId === 'auth-required') {
      setAllergens([]);
      return;
    }

    let active = true;
    const syncAllergens = async () => {
      try {
        const profile = await UserService.getUserProfile(userId, { allowBackgroundRefresh: false });
        if (!active || !profile) return;
        setAllergens(profile.safetyProfile.allergies);
      } catch (error) {
        if (!active) return;
        console.warn(error);
      }
    };

    void syncAllergens();
    const unsubscribe = subscribeUserProfileUpdated(userId, (reason) => {
      if (!shouldRefreshTravelerAllergens(reason)) {
        return;
      }

      void syncAllergens();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [providedAllergens]);

  return providedAllergens ?? allergens;
};
