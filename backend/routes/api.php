<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\Admin\PermissionManagementController;
use App\Http\Controllers\Api\Admin\RoleManagementController;
use App\Http\Controllers\Api\Admin\UserManagementController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:5,1');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', [AuthController::class, 'user']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::prefix('admin')->group(function () {
        Route::get('/users', [UserManagementController::class, 'index']);
        Route::post('/users', [UserManagementController::class, 'store']);
        Route::post('/users/bulk-delete', [UserManagementController::class, 'bulkDestroy']);
        Route::put('/users/{user}', [UserManagementController::class, 'update']);
        Route::delete('/users/{user}', [UserManagementController::class, 'destroy']);

        Route::get('/roles', [RoleManagementController::class, 'index']);
        Route::post('/roles', [RoleManagementController::class, 'store']);
        Route::post('/roles/bulk-delete', [RoleManagementController::class, 'bulkDestroy']);
        Route::put('/roles/{role}', [RoleManagementController::class, 'update']);
        Route::delete('/roles/{role}', [RoleManagementController::class, 'destroy']);

        Route::get('/permissions', [PermissionManagementController::class, 'index']);
        Route::post('/permissions', [PermissionManagementController::class, 'store']);
        Route::post('/permissions/bulk-delete', [PermissionManagementController::class, 'bulkDestroy']);
        Route::put('/permissions/{permission}', [PermissionManagementController::class, 'update']);
        Route::delete('/permissions/{permission}', [PermissionManagementController::class, 'destroy']);
    });
});
