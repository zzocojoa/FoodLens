import type { ResultLocationData } from '@/components/result/resultContent/types';
import { formatTimestamp, getLocationText } from '@/components/result/resultContent/utils/resultContentFormatters';
import {
    resolveLocalizedFoodName,
    resolveLocalizedIngredientName,
    resolveLocalizedSummary,
} from '@/components/result/resultContent/utils/localizedNames';
import { SUPPORT_EMAIL_ADDRESS } from '@/features/support/supportContent';
import type { LoadedAnalysisData } from '@/hooks/result/analysisDataService';
import { isKoreanLocale } from '@/services/i18n/nameResolver';
import type { ResultShareCardThemeVariant } from './ResultShareCard';

type ResultActionTextResolver = (key: string, fallback?: string) => string;

type ResultActionData = NonNullable<LoadedAnalysisData['result']>;
type ResultActionDataWithId = ResultActionData & { id?: string };

type ResultShareCardData = {
    brandLabel: string;
    foodName: string;
    safetyLabel: string;
    reasonTitle: string;
    actionTitle: string;
    reasons: string[];
    actionLine: string;
    disclaimer: string;
    locationLabel: string | null;
    placeholderLabel: string;
    themeVariant: ResultShareCardThemeVariant;
};

type ResultShareMessageData = {
    title: string;
    message: string;
};

type BuildResultActionInput = {
    result: ResultActionData;
    locationData: ResultLocationData;
    timestamp: string | null | undefined;
    locale: string;
    t: ResultActionTextResolver;
};

const MAX_SHARE_REASON_COUNT = 2;
const MAX_SHARE_REASON_LENGTH = 120;

const buildSafetyLabel = (status: ResultActionData['safetyStatus'], t: ResultActionTextResolver): string => {
    if (status === 'SAFE') {
        return t('result.safety.ok', 'OK');
    }

    if (status === 'CAUTION') {
        return t('result.safety.ask', 'ASK');
    }

    return t('result.safety.avoid', 'AVOID');
};

const buildCommonResultLines = (
    input: BuildResultActionInput
): {
    foodName: string;
    safetyLabel: string;
    locationText: string;
    formattedTimestamp: string | null;
    resultLines: string[];
} => {
    const foodName = resolveLocalizedFoodName(input.result, input.locale);
    const safetyLabel = buildSafetyLabel(input.result.safetyStatus, input.t);
    const locationText = getLocationText(
        input.locationData,
        input.t('result.location.none', 'No Location Info'),
        input.locale
    );
    const formattedTimestamp = input.timestamp ? formatTimestamp(input.timestamp, input.locale) : null;

    const resultLines = [
        `${input.t('result.share.foodLabel', 'Food')}: ${foodName}`,
        `${input.t('result.share.statusLabel', 'Safety')}: ${safetyLabel}`,
        `${input.t('result.share.locationLabel', 'Location')}: ${locationText}`,
        formattedTimestamp
            ? `${input.t('result.share.timeLabel', 'Analyzed at')}: ${formattedTimestamp}`
            : null,
    ].filter((line): line is string => typeof line === 'string' && line.trim().length > 0);

    return {
        foodName,
        safetyLabel,
        locationText,
        formattedTimestamp,
        resultLines,
    };
};

const buildShareCardSafetyLabel = (
    status: ResultActionData['safetyStatus'],
    t: ResultActionTextResolver
): string => {
    if (status === 'SAFE') {
        return t('result.share.card.safety.safe', 'Low Risk');
    }

    if (status === 'CAUTION') {
        return t('result.share.card.safety.caution', 'Use Caution');
    }

    return t('result.share.card.safety.avoid', 'Avoid');
};

const buildShareCardThemeVariant = (
    status: ResultActionData['safetyStatus']
): ResultShareCardThemeVariant => {
    if (status === 'SAFE') {
        return 'safe';
    }

    if (status === 'CAUTION') {
        return 'caution';
    }

    return 'avoid';
};

const normalizeShareLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

const clampShareLine = (value: string): string => {
    if (value.length <= MAX_SHARE_REASON_LENGTH) {
        return value;
    }

    return `${value.slice(0, MAX_SHARE_REASON_LENGTH - 3).trimEnd()}...`;
};

const resolveShareLocationLabel = (
    locationData: ResultLocationData,
    locale: string
): string | null => {
    if (!locationData) {
        return null;
    }

    const isKorean = isKoreanLocale(locale);
    const separator = isKorean ? ' ' : ', ';
    const coarseParts = [locationData.city, locationData.country].filter(
        (part): part is string => typeof part === 'string' && part.trim().length > 0
    );

    if (coarseParts.length > 0) {
        return isKorean ? [...coarseParts].reverse().join(separator) : coarseParts.join(separator);
    }

    if (typeof locationData.country === 'string' && locationData.country.trim().length > 0) {
        return locationData.country.trim();
    }

    return null;
};

const buildAllergenReasonLine = (
    input: BuildResultActionInput
): string | null => {
    const allergenNames = input.result.ingredients
        .filter((ingredient) => ingredient.isAllergen)
        .map((ingredient) => resolveLocalizedIngredientName(ingredient, input.locale))
        .filter((name, index, names) => name.trim().length > 0 && names.indexOf(name) === index)
        .slice(0, MAX_SHARE_REASON_COUNT);

    if (allergenNames.length === 0) {
        return null;
    }

    return `${input.t('result.share.card.reasonAllergenPrefix', 'Potential allergens')}: ${allergenNames.join(', ')}`;
};

const buildSummaryReasonLine = (
    input: BuildResultActionInput
): string | null => {
    const localizedSummary = resolveLocalizedSummary(input.result, input.locale);

    if (!localizedSummary) {
        return null;
    }

    const summaryLines = localizedSummary
        .split('\n')
        .map(normalizeShareLine)
        .filter((line) => line.length > 0);

    if (summaryLines.length === 0) {
        return null;
    }

    return clampShareLine(summaryLines[0]);
};

const buildFallbackReasonLine = (
    input: BuildResultActionInput
): string => {
    if (input.result.safetyStatus === 'SAFE') {
        return input.t(
            'result.share.card.reasonFallback.safe',
            'No clear risk signal was found, but verify once more before eating.'
        );
    }

    if (input.result.safetyStatus === 'CAUTION') {
        return input.t(
            'result.share.card.reasonFallback.caution',
            'Risk can vary depending on ingredients or preparation.'
        );
    }

    return input.t(
        'result.share.card.reasonFallback.avoid',
        'This appears likely to contain allergy-triggering ingredients.'
    );
};

const buildActionLine = (input: BuildResultActionInput): string => {
    if (input.result.safetyStatus === 'SAFE') {
        return input.t(
            'result.share.card.action.safe',
            'Double-check the label or ask staff before eating.'
        );
    }

    if (input.result.safetyStatus === 'CAUTION') {
        return input.t(
            'result.share.card.action.caution',
            'Confirm with staff or packaging before eating.'
        );
    }

    return input.t(
        'result.share.card.action.avoid',
        'Avoid eating until the ingredients are clearly confirmed.'
    );
};

const buildReasonLines = (input: BuildResultActionInput): string[] => {
    const candidateReasons = [buildAllergenReasonLine(input), buildSummaryReasonLine(input)]
        .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
        .map(normalizeShareLine)
        .map(clampShareLine)
        .filter((line, index, lines) => lines.indexOf(line) === index)
        .slice(0, MAX_SHARE_REASON_COUNT);

    if (candidateReasons.length > 0) {
        return candidateReasons;
    }

    return [buildFallbackReasonLine(input)];
};

const resolveResultRecordId = (
    result: ResultActionData,
    savedRecordId: string | null
): string | null => {
    if (typeof savedRecordId === 'string' && savedRecordId.trim().length > 0) {
        return savedRecordId;
    }

    const resultId = (result as ResultActionDataWithId).id;
    if (typeof resultId !== 'string') {
        return null;
    }

    const trimmedResultId = resultId.trim();
    return trimmedResultId.length > 0 ? trimmedResultId : null;
};

export const isResultReportPendingSave = (
    isNewResult: boolean,
    savedRecordId: string | null
): boolean => isNewResult && savedRecordId === null;

export const buildResultShareCardData = (
    input: BuildResultActionInput
): ResultShareCardData => {
    const foodName = resolveLocalizedFoodName(input.result, input.locale);

    return {
        brandLabel: input.t('result.share.card.brand', 'FoodLens Analysis'),
        foodName,
        safetyLabel: buildShareCardSafetyLabel(input.result.safetyStatus, input.t),
        reasonTitle: input.t('result.share.card.reasonTitle', 'Why'),
        actionTitle: input.t('result.share.card.actionTitle', 'What to do'),
        reasons: buildReasonLines(input),
        actionLine: buildActionLine(input),
        disclaimer: input.t(
            'result.share.card.disclaimer',
            'Always verify ingredients before eating.'
        ),
        locationLabel: resolveShareLocationLabel(input.locationData, input.locale),
        placeholderLabel: input.t('result.share.card.placeholder', 'Food photo'),
        themeVariant: buildShareCardThemeVariant(input.result.safetyStatus),
    };
};

export const buildResultShareMessage = (input: BuildResultActionInput): string => {
    const { resultLines } = buildCommonResultLines(input);
    const localizedSummary = resolveLocalizedSummary(input.result, input.locale);
    const summaryLine = localizedSummary
        ? `${input.t('result.share.summaryLabel', 'Summary')}: ${clampShareLine(normalizeShareLine(localizedSummary))}`
        : null;

    return [
        input.t('result.share.title', 'FoodLens analysis result'),
        '',
        ...resultLines,
        summaryLine,
        '',
        input.t('result.share.attachmentHint', 'See the attached image card for a quick summary.'),
        '',
        input.t('result.share.footer', 'Shared from FoodLens'),
    ]
        .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
        .join('\n');
};

export const buildResultShareMessageData = (
    input: BuildResultActionInput
): ResultShareMessageData => ({
    title: input.t('result.share.title', 'FoodLens analysis result'),
    message: buildResultShareMessage(input),
});

export const buildResultReportMailtoUrl = (
    input: BuildResultActionInput & {
        savedRecordId: string | null;
    }
): string => {
    const common = buildCommonResultLines(input);
    const recordId = resolveResultRecordId(input.result, input.savedRecordId);
    const intro = input.t(
        'result.report.intro',
        'I want to report an incorrect analysis result.'
    );
    const reportLines = [
        `${input.t('result.report.foodLabel', 'Food')}: ${common.foodName}`,
        `${input.t('result.report.statusLabel', 'Safety')}: ${common.safetyLabel}`,
        `${input.t('result.report.locationLabel', 'Location')}: ${common.locationText}`,
        common.formattedTimestamp
            ? `${input.t('result.report.timeLabel', 'Analyzed at')}: ${common.formattedTimestamp}`
            : null,
    ].filter((line): line is string => typeof line === 'string' && line.trim().length > 0);

    const bodyLines = [
        intro,
        '',
        ...reportLines,
        `${input.t('result.report.requestIdLabel', 'Request ID')}: ${input.result.request_id ?? input.t('common.na', 'N/A')}`,
        `${input.t('result.report.recordIdLabel', 'History record')}: ${recordId ?? input.t('common.na', 'N/A')}`,
        `${input.t('result.report.modelLabel', 'Model')}: ${input.result.used_model ?? input.t('common.na', 'N/A')}`,
        `${input.t('result.report.promptVersionLabel', 'Prompt version')}: ${input.result.prompt_version ?? input.t('common.na', 'N/A')}`,
        '',
        input.t('result.report.bodyPrompt', 'Please describe the issue:'),
    ];

    const subject = input.t('result.report.subject', 'Incorrect result report');
    return `mailto:${SUPPORT_EMAIL_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
};
