import type { LoggerService } from '@nestjs/common'
import { utilities as nestWinstonModuleUtilities, WinstonModule } from 'nest-winston'
import { createLogger, format, LoggerOptions, transports } from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

const sensitiveLogField = /^(authorization|cookie|password|rawbody|secret|session|signature|token)$/i

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

export function redactLogInfo<T extends Record<string, unknown>>(info: T): T {
	const seen = new WeakSet<object>()
	const redact = (value: unknown): void => {
		if (!isRecord(value) || seen.has(value)) return
		seen.add(value)
		for (const [key, nested] of Object.entries(value)) {
			if (key === 'stack') {
				delete value[key]
				continue
			}
			if (sensitiveLogField.test(key)) {
				value[key] = '[REDACTED]'
				continue
			}
			redact(nested)
		}
	}
	redact(info)
	return info
}

const redactFormat = format((info) => redactLogInfo(info))

// For development environment
const loggerOptions: LoggerOptions = {
	level: 'silly',
	transports: [
		// - Write all logs to console when in development environment
		new transports.Console({
			format: format.combine(
				redactFormat(),
				format.timestamp(),
				format.ms(),
				nestWinstonModuleUtilities.format.nestLike('project-junction', {
					colors: true,
					prettyPrint: true,
				}),
			),
			handleExceptions: true,
		}),
		// - Write all logs with importance level of `error` or less to `error.log` file
		new DailyRotateFile({
			level: 'error',
			dirname: 'logs/error',
			filename: `%DATE%-error.log`, // This will make the log to rotate every day
			datePattern: 'YYYY-MM-DD',
			format: format.combine(
				redactFormat(),
				format.timestamp(),
				format.ms(),
				nestWinstonModuleUtilities.format.nestLike('project-junction', {
					prettyPrint: true,
				}),
			),
			handleExceptions: true,
			zippedArchive: true, // gzip archived log files
			maxFiles: 90, // Will keep error log until they are older than 90 days
		}),
		// - Write all logs `combined.log` file
		new DailyRotateFile({
			dirname: 'logs/combined',
			filename: `%DATE%-combined.log`, // This will make the log to rotate every day
			datePattern: 'YYYY-MM-DD',
			format: format.combine(
				redactFormat(),
				format.timestamp(),
				format.ms(),
				nestWinstonModuleUtilities.format.nestLike('project-junction', {
					prettyPrint: true,
				}),
			),
			handleExceptions: true,
			zippedArchive: true, // gzip archived log files
			maxFiles: '10d', // Will keep combined log until they are older than 10 days
		}),
	],
}

const winstonLoggerInstance = createLogger(loggerOptions)

export function createApiLogger(logLevel: string): LoggerService {
	return WinstonModule.createLogger({ ...loggerOptions, level: logLevel })
}

export default winstonLoggerInstance
