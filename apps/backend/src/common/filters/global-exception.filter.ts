import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { AppLogger } from '../../logger/app.logger.js';

interface HttpResponse {
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<HttpResponse>();
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    this.logger.error('Unhandled backend exception', exception);

    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : exceptionResponse &&
            typeof exceptionResponse === 'object' &&
            'message' in exceptionResponse
          ? (exceptionResponse as { message?: unknown }).message
          : undefined;

    response.status(statusCode).json({
      statusCode,
      error: exception instanceof HttpException ? exception.name : 'InternalServerError',
      ...(typeof message === 'string' || Array.isArray(message) ? { message } : {}),
      timestamp: new Date().toISOString(),
    });
  }
}
