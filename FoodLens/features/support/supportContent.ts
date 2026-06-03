export type SupportFaqCategoryId = 'all' | 'login' | 'analysis' | 'account' | 'privacy';
export type SupportFaqTopicId = Exclude<SupportFaqCategoryId, 'all'>;

export type SupportFaqCategory = {
  id: SupportFaqCategoryId;
  labelKey: string;
  labelFallback: string;
};

export type SupportFaqItem = {
  id: string;
  categoryId: SupportFaqTopicId;
  questionKey: string;
  questionFallback: string;
  answerKey: string;
  answerFallback: string;
};

const SUPPORT_EMAIL_ENV = (process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '').trim();

export const SUPPORT_EMAIL_ADDRESS = SUPPORT_EMAIL_ENV || 'support@foodlens.com';

export const SUPPORT_FAQ_CATEGORIES: readonly SupportFaqCategory[] = [
  { id: 'all', labelKey: 'support.faq.category.all', labelFallback: 'All' },
  { id: 'login', labelKey: 'support.faq.category.login', labelFallback: 'Login' },
  { id: 'analysis', labelKey: 'support.faq.category.analysis', labelFallback: 'Analysis' },
  { id: 'account', labelKey: 'support.faq.category.account', labelFallback: 'Account' },
  { id: 'privacy', labelKey: 'support.faq.category.privacy', labelFallback: 'Privacy' },
] as const;

export const SUPPORT_FAQ_ITEMS: readonly SupportFaqItem[] = [
  {
    id: 'sign-in-help',
    categoryId: 'login',
    questionKey: 'support.faq.item.signIn.question',
    questionFallback: 'How do I sign in?',
    answerKey: 'support.faq.item.signIn.answer',
    answerFallback: 'Use Google, Kakao, or email login. If you forgot your password, use the reset link on the login screen.',
  },
  {
    id: 'analysis-failure',
    categoryId: 'analysis',
    questionKey: 'support.faq.item.analysisFailure.question',
    questionFallback: 'What should I do if analysis fails?',
    answerKey: 'support.faq.item.analysisFailure.answer',
    answerFallback: 'Check your connection and try again. If the issue continues, contact support and include a screenshot.',
  },
  {
    id: 'report-wrong-result',
    categoryId: 'analysis',
    questionKey: 'support.faq.item.reportWrongResult.question',
    questionFallback: 'How do I report a wrong result?',
    answerKey: 'support.faq.item.reportWrongResult.answer',
    answerFallback: 'Open Contact Support and share the result details, the food name, and what should be corrected.',
  },
  {
    id: 'edit-health-profile',
    categoryId: 'account',
    questionKey: 'support.faq.item.editHealthProfile.question',
    questionFallback: 'How do I change my health profile?',
    answerKey: 'support.faq.item.editHealthProfile.answer',
    answerFallback: 'Go to Profile and update your allergens, restrictions, or traveler card language.',
  },
  {
    id: 'delete-data-account',
    categoryId: 'privacy',
    questionKey: 'support.faq.item.deleteData.question',
    questionFallback: 'What is the difference between deleting data and deleting my account?',
    answerKey: 'support.faq.item.deleteData.answer',
    answerFallback: 'Delete My Data removes stored profile and history. Delete Account removes the account and signs you out.',
  },
  {
    id: 'language-setting',
    categoryId: 'account',
    questionKey: 'support.faq.item.languageSetting.question',
    questionFallback: 'How do I change the app language?',
    answerKey: 'support.faq.item.languageSetting.answer',
    answerFallback: 'Open Profile or the app settings and change the language preference to update the UI language.',
  },
] as const;

export const buildSupportMailtoUrl = (subject: string, body: string): string => {
  const encodedSubject = encodeURIComponent(subject.trim());
  const encodedBody = encodeURIComponent(body.trim());
  return `mailto:${SUPPORT_EMAIL_ADDRESS}?subject=${encodedSubject}&body=${encodedBody}`;
};
