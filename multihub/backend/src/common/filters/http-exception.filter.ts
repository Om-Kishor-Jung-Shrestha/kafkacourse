import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { PinoLoggerService } from '../logger/pino-logger.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger?: PinoLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<any>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' }; // never leak raw error internals to the client

    if (status >= 500) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger?.error(
        { path: request?.url, method: request?.method, message: err.message },
        err.stack,
        'HttpExceptionFilter',
      );
    }

    response.status(status).json(typeof body === 'string' ? { message: body } : body);
  }
}
