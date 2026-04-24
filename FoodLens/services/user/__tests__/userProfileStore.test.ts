import type { UserProfileUpdateReason } from '../userProfileStore';
import { publishUserProfileUpdated, subscribeUserProfileUpdated } from '../userProfileStore';

describe('userProfileStore', () => {
  it('passes the update reason through while keeping legacy listeners working', () => {
    const receivedReasons: UserProfileUpdateReason[] = [];
    let legacyCallCount = 0;

    const unsubscribeReasonListener = subscribeUserProfileUpdated(' usr_reason ', (reason) => {
      receivedReasons.push(reason);
    });
    const unsubscribeLegacyListener = subscribeUserProfileUpdated('usr_reason', () => {
      legacyCallCount += 1;
    });

    publishUserProfileUpdated('usr_reason', 'client_state_write');

    expect(receivedReasons).toEqual(['client_state_write']);
    expect(legacyCallCount).toBe(1);

    unsubscribeReasonListener();
    unsubscribeLegacyListener();
  });
});
