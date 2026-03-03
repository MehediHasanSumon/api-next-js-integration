<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserManagementController extends Controller
{
    public function index(): JsonResponse
    {
        $users = User::query()
            ->with('roles:id,name')
            ->select(['id', 'name', 'email', 'email_verified_at', 'created_at'])
            ->orderByDesc('id')
            ->get();

        return response()->json($users);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
            'password_confirmation' => 'required|string|min:8',
            'email_verified' => 'sometimes|boolean',
            'email_verified_at' => 'nullable|date',
            'role' => 'nullable|string|exists:roles,name',
            'roles' => 'array',
            'roles.*' => 'string|exists:roles,name',
        ]);

        $emailVerifiedAt = array_key_exists('email_verified', $validated)
            ? ($validated['email_verified'] ? now() : null)
            : ($validated['email_verified_at'] ?? null);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'email_verified_at' => $emailVerifiedAt,
        ]);

        if (isset($validated['roles'])) {
            $user->syncRoles($validated['roles']);
        } elseif (isset($validated['role'])) {
            $user->syncRoles([$validated['role']]);
        }

        return response()->json($user->load('roles:id,name'), 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email,' . $user->id,
            'password' => 'nullable|string|min:8|confirmed',
            'password_confirmation' => 'nullable|string|min:8',
            'email_verified' => 'sometimes|boolean',
            'email_verified_at' => 'nullable|date',
            'role' => 'nullable|string|exists:roles,name',
            'roles' => 'array',
            'roles.*' => 'string|exists:roles,name',
        ]);

        $emailVerifiedAt = array_key_exists('email_verified', $validated)
            ? ($validated['email_verified'] ? now() : null)
            : ($validated['email_verified_at'] ?? null);

        $payload = [
            'name' => $validated['name'],
            'email' => $validated['email'],
            'email_verified_at' => $emailVerifiedAt,
        ];

        if (!empty($validated['password'])) {
            $payload['password'] = Hash::make($validated['password']);
        }

        $user->update($payload);

        if (isset($validated['roles'])) {
            $user->syncRoles($validated['roles']);
        } elseif (isset($validated['role'])) {
            $user->syncRoles([$validated['role']]);
        }

        return response()->json($user->fresh()->load('roles:id,name'));
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        if ((int) $request->user()->id === (int) $user->id) {
            return response()->json([
                'message' => 'You cannot delete your own account',
            ], 422);
        }

        $user->delete();

        return response()->json([
            'message' => 'User deleted successfully',
        ]);
    }
}
