import { captureError, captureWarning } from '@/services/sentry';

type LogMeta = unknown;

const formatTag = (tag?: string): string => (tag ? `[${tag}]` : '');

export const logger = {
  debug(message: string, meta?: LogMeta, tag?: string) {
    if (!__DEV__) return;
    const prefix = formatTag(tag);
    if (meta !== undefined) {
      console.log(prefix, message, meta);
      return;
    }
    console.log(prefix, message);
  },

  info(message: string, meta?: LogMeta, tag?: string) {
    if (!__DEV__) return;
    const prefix = formatTag(tag);
    if (meta !== undefined) {
      console.log(prefix, message, meta);
      return;
    }
    console.log(prefix, message);
  },

  warn(message: string, meta?: LogMeta, tag?: string) {
    const prefix = formatTag(tag);
    if (meta !== undefined) {
      console.warn(prefix, message, meta);
    } else {
      console.warn(prefix, message);
    }
    // Send warning as Sentry breadcrumb (production only)
    captureWarning(`${formatTag(tag)} ${message}`, meta as Record<string, unknown>);
  },

  error(message: string, meta?: LogMeta, tag?: string) {
    const prefix = formatTag(tag);
    if (meta !== undefined) {
      console.error(prefix, message, meta);
    } else {
      console.error(prefix, message);
    }
    // Send error to Sentry (production only)
    captureError(new Error(`${formatTag(tag)} ${message}`), meta as Record<string, unknown>);
  },
};
