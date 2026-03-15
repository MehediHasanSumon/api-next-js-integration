<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PresenceController;
use App\Http\Controllers\Api\Chat\AttachmentController;
use App\Http\Controllers\Api\Chat\ConversationController;
use App\Http\Controllers\Api\Chat\MessageController;
use App\Http\Controllers\Api\Chat\TypingController;
use App\Http\Controllers\Api\Chat\UserDirectoryController;
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
    Route::post('/presence/ping', [PresenceController::class, 'ping']);
    Route::get('/presence/status', [PresenceController::class, 'status']);

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

    Route::prefix('chat')->group(function () {
        Route::get('/users', [UserDirectoryController::class, 'index']);
        Route::post('/attachments', [AttachmentController::class, 'store']);
        Route::post('/conversations', [ConversationController::class, 'store']);
        Route::get('/conversations', [ConversationController::class, 'index']);
        Route::get('/conversations/{conversation}', [ConversationController::class, 'show']);
        Route::patch('/conversations/{conversation}', [ConversationController::class, 'update']);
        Route::post('/conversations/{conversation}/request/respond', [ConversationController::class, 'respondToRequest']);
        Route::post('/conversations/{conversation}/archive', [ConversationController::class, 'archive']);
        Route::delete('/conversations/{conversation}/archive', [ConversationController::class, 'unarchive']);

        Route::get('/conversations/{conversation}/messages', [MessageController::class, 'index']);
        Route::post('/conversations/{conversation}/messages', [MessageController::class, 'store']);
        Route::post('/conversations/{conversation}/messages/read', [MessageController::class, 'markRead']);
        Route::put('/messages/{message}', [MessageController::class, 'update']);
        Route::post('/messages/{message}/forward', [MessageController::class, 'forward']);
        Route::post('/messages/{message}/reactions', [MessageController::class, 'toggleReaction']);
        Route::delete('/messages/{message}/reactions', [MessageController::class, 'removeReaction']);
        Route::post('/messages/{message}/remove-for-you', [MessageController::class, 'removeForYou']);
        Route::post('/messages/{message}/remove-for-everywhere', [MessageController::class, 'removeForEverywhere']);

        Route::post('/conversations/{conversation}/typing', [TypingController::class, 'update']);
    });
});
