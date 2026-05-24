import { UI_LANGUAGE_OPTIONS } from '../constants';

describe('profile sheet constants', () => {
  it('offers English, Japanese, Korean, and Simplified Chinese as settings languages', () => {
    const optionCodes = UI_LANGUAGE_OPTIONS.map((option) => option.code);

    expect(optionCodes).toEqual(['auto', 'ko-KR', 'en-US', 'ja-JP', 'zh-Hans']);
  });
});
