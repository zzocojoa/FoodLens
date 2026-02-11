import { useEffect, useRef } from 'react';

export function useSwipeableRegistry(isEditMode: boolean) {
    const swipeableRefs = useRef<Map<string, any>>(new Map());

    useEffect(() => {
        if (isEditMode) {
            swipeableRefs.current.forEach((ref) => {
                if (ref) ref.close();
            });
        }
    }, [isEditMode]);

    const setSwipeableRef = (id: string, ref: any | null) => {
        if (ref) swipeableRefs.current.set(id, ref);
        else swipeableRefs.current.delete(id);
    };

    return { setSwipeableRef };
}
