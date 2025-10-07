import { Injectable, LoggerService } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { loggerConfig } from '../../config';

@Injectable()
export class CustomLoggerService implements LoggerService {
  private logLevel: string;
  private logsDir: string;

  constructor() {
    this.logLevel = loggerConfig.level;
    this.logsDir = path.join(process.cwd(), 'logs');

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private formatMessage(level: string, message: string, context?: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? `[${context}] ` : '';
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level.toUpperCase()}] ${contextStr}${message}${metaStr}`;
  }

  private writeToFile(level: string, formattedMessage: string): void {
    try {
      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logsDir, `application-${today}.log`);
      fs.appendFileSync(logFile, formattedMessage + '\n');

      // Also write errors to separate error log
      if (level === 'error') {
        const errorFile = path.join(this.logsDir, `error-${today}.log`);
        fs.appendFileSync(errorFile, formattedMessage + '\n');
      }
    } catch (error) {
      // If file writing fails, just log to console
      console.error('Failed to write to log file:', error);
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug', 'verbose'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  log(message: any, context?: string) {
    if (this.shouldLog('info')) {
      const formattedMessage = this.formatMessage('info', String(message), context);
      console.log(formattedMessage);
      this.writeToFile('info', formattedMessage);
    }
  }

  error(message: any, stack?: string, context?: string) {
    if (this.shouldLog('error')) {
      const errorMessage = stack ? `${message}\n${stack}` : String(message);
      const formattedMessage = this.formatMessage('error', errorMessage, context);
      console.error(formattedMessage);
      this.writeToFile('error', formattedMessage);
    }
  }

  warn(message: any, context?: string) {
    if (this.shouldLog('warn')) {
      const formattedMessage = this.formatMessage('warn', String(message), context);
      console.warn(formattedMessage);
      this.writeToFile('warn', formattedMessage);
    }
  }

  debug(message: any, context?: string) {
    if (this.shouldLog('debug')) {
      const formattedMessage = this.formatMessage('debug', String(message), context);
      console.debug(formattedMessage);
      this.writeToFile('debug', formattedMessage);
    }
  }

  verbose(message: any, context?: string) {
    if (this.shouldLog('verbose')) {
      const formattedMessage = this.formatMessage('verbose', String(message), context);
      console.log(formattedMessage);
      this.writeToFile('verbose', formattedMessage);
    }
  }

  // Additional methods for structured logging
  logInfo(message: string, meta?: any, context?: string) {
    if (this.shouldLog('info')) {
      const formattedMessage = this.formatMessage('info', message, context, meta);
      console.log(formattedMessage);
      this.writeToFile('info', formattedMessage);
    }
  }

  logError(message: string, error?: Error, meta?: any, context?: string) {
    if (this.shouldLog('error')) {
      const errorMessage = error ? `${message}\nError: ${error.message}\nStack: ${error.stack}` : message;
      const formattedMessage = this.formatMessage('error', errorMessage, context, meta);
      console.error(formattedMessage);
      this.writeToFile('error', formattedMessage);
    }
  }

  logWarning(message: string, meta?: any, context?: string) {
    if (this.shouldLog('warn')) {
      const formattedMessage = this.formatMessage('warn', message, context, meta);
      console.warn(formattedMessage);
      this.writeToFile('warn', formattedMessage);
    }
  }

  logDebug(message: string, meta?: any, context?: string) {
    if (this.shouldLog('debug')) {
      const formattedMessage = this.formatMessage('debug', message, context, meta);
      console.debug(formattedMessage);
      this.writeToFile('debug', formattedMessage);
    }
  }
}
