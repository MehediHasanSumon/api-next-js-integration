<?php

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Spatie\Permission\Middleware\RoleMiddleware;
use Spatie\Permission\Middleware\RoleOrPermissionMiddleware;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withBroadcasting(
        __DIR__ . '/../routes/channels.php',
        ['prefix' => 'api', 'middleware' => ['api', 'auth:sanctum']],
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->alias([
            'role' => RoleMiddleware::class,
            'permission' => PermissionMiddleware::class,
            'role_or_permission' => RoleOrPermissionMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $shouldRenderApiError = static function (Request $request): bool {
            return $request->is('api/*') || $request->expectsJson();
        };

        $exceptions->render(function (AuthenticationException $exception, Request $request) use ($shouldRenderApiError) {
            if (!$shouldRenderApiError($request)) {
                return null;
            }

            return response()->json([
                'status' => 401,
                'message' => 'Unauthenticated.',
                'error' => [
                    'code' => 'UNAUTHENTICATED',
                    'message' => 'Authentication is required to access this resource.',
                ],
            ], 401);
        });

        $exceptions->render(function (AuthorizationException $exception, Request $request) use ($shouldRenderApiError) {
            if (!$shouldRenderApiError($request)) {
                return null;
            }

            $message = trim((string) $exception->getMessage()) !== ''
                ? $exception->getMessage()
                : 'You are not allowed to perform this action.';

            return response()->json([
                'status' => 403,
                'message' => $message,
                'error' => [
                    'code' => 'FORBIDDEN',
                    'message' => $message,
                ],
            ], 403);
        });

        $exceptions->render(function (ModelNotFoundException $exception, Request $request) use ($shouldRenderApiError) {
            if (!$shouldRenderApiError($request)) {
                return null;
            }

            return response()->json([
                'status' => 404,
                'message' => 'Requested resource was not found.',
                'error' => [
                    'code' => 'NOT_FOUND',
                    'message' => 'Requested resource was not found.',
                ],
            ], 404);
        });

        $exceptions->render(function (ConflictHttpException $exception, Request $request) use ($shouldRenderApiError) {
            if (!$shouldRenderApiError($request)) {
                return null;
            }

            $message = trim((string) $exception->getMessage()) !== ''
                ? $exception->getMessage()
                : 'Request conflicts with current resource state.';

            return response()->json([
                'status' => 409,
                'message' => $message,
                'error' => [
                    'code' => 'CONFLICT',
                    'message' => $message,
                ],
            ], 409);
        });

        $exceptions->render(function (ValidationException $exception, Request $request) use ($shouldRenderApiError) {
            if (!$shouldRenderApiError($request)) {
                return null;
            }

            return response()->json([
                'status' => 422,
                'message' => $exception->getMessage(),
                'error' => [
                    'code' => 'VALIDATION_ERROR',
                    'message' => 'Validation failed for one or more fields.',
                ],
                'errors' => $exception->errors(),
            ], 422);
        });

        $exceptions->render(function (HttpExceptionInterface $exception, Request $request) use ($shouldRenderApiError) {
            if (!$shouldRenderApiError($request)) {
                return null;
            }

            $status = $exception->getStatusCode();
            if (!in_array($status, [401, 403, 404, 409], true)) {
                return null;
            }

            $codeMap = [
                401 => 'UNAUTHENTICATED',
                403 => 'FORBIDDEN',
                404 => 'NOT_FOUND',
                409 => 'CONFLICT',
            ];

            $defaultMessageMap = [
                401 => 'Unauthenticated.',
                403 => 'You are not allowed to perform this action.',
                404 => 'Requested resource was not found.',
                409 => 'Request conflicts with current resource state.',
            ];

            $message = trim((string) $exception->getMessage()) !== ''
                ? $exception->getMessage()
                : $defaultMessageMap[$status];

            return response()->json([
                'status' => $status,
                'message' => $message,
                'error' => [
                    'code' => $codeMap[$status],
                    'message' => $message,
                ],
            ], $status);
        });
    })->create();
