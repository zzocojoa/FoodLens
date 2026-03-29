import type { ResultLocationData } from '@/components/result/resultContent/types';
import { formatTimestamp, getLocationText } from '@/components/result/resultContent/utils/resultContentFormatters';
import { resolveLocalizedFoodName } from '@/components/result/resultContent/utils/localizedNames';
import { SUPPORT_EMAIL_ADDRESS } from '@/features/support/supportContent';
import type { LoadedAnalysisData } from '@/hooks/result/analysisDataService';

type ResultActionTextResolver = (key: string, fallback?: string) => string;

type ResultActionData = NonNullable<LoadedAnalysisData['result']>;
type ResultActionDataWithId = ResultActionData & { id?: string };

type BuildResultActionInput = {
    result: ResultActionData;
    locationData: ResultLocationData;
    timestamp: string | null | undefined;
    locale: string;
    t: ResultActionTextResolver;
};

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

export const buildResultShareMessage = (input: BuildResultActionInput): string => {
    const { resultLines } = buildCommonResultLines(input);
    return [
        input.t('result.share.title', 'FoodLens analysis result'),
        '',
        ...resultLines,
        '',
        input.t('result.share.footer', 'Shared from FoodLens'),
    ].join('\n');
};

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
