import React from 'react';
import { render } from '@testing-library/react-native';
import { ChevronRight, Mail } from 'lucide-react-native';
import { homeDashboardDarkColors } from '@/features/home/components/homeDashboardTokens';
import SupportPoliciesDesk from '../SupportPoliciesDesk';

jest.mock('@/features/home/components/HomeBackgroundAtmosphere', () => ({
  HomeBackgroundAtmosphere: () => null,
}));

jest.mock('@/features/home/components/PearlSurfaceOverlay', () => () => null);

const copy = {
  supportTitle: 'Support',
  helpTitle: 'Help Center',
  helpDescription: 'Find answers',
  contactTitle: 'Contact Support',
  contactDescription: 'Send a note',
  legalTitle: 'Legal',
  privacyTitle: 'Privacy Policy',
  termsTitle: 'Terms of Service',
  externalHint: 'Opens externally',
  accountTitle: 'Account & Data',
  accountDescription: 'Manage account data',
};

describe('SupportPoliciesDesk', () => {
  it('uses dark dashboard tokens for the contact row icons', () => {
    const { UNSAFE_getAllByType, UNSAFE_getByType } = render(
      <SupportPoliciesDesk
        bottomInset={0}
        colorScheme="dark"
        copy={copy}
        onOpenAccountData={jest.fn()}
        onOpenHelpCenter={jest.fn()}
        onOpenPrivacyPolicy={jest.fn()}
        onOpenSupportContact={jest.fn()}
        onOpenTermsOfService={jest.fn()}
      />
    );

    const mailIcon = UNSAFE_getByType(Mail);
    const contactChevron = UNSAFE_getAllByType(ChevronRight)[1];

    expect(mailIcon.props.color).toBe(homeDashboardDarkColors.accentGreen);
    expect(contactChevron.props.color).toBe(homeDashboardDarkColors.inkSoft);
  });
});
