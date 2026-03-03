<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserManagementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => 'nullable|string|max:255',
            'role' => 'nullable|string|max:255',
            'verified' => 'nullable|in:verified,unverified',
            'per_page' => 'nullable|integer|min:5|max:100',
        ]);

        $usersQuery = User::query()
            ->with('roles:id,name')
            ->select(['id', 'name', 'email', 'email_verified_at', 'created_at'])
            ->orderByDesc('id');

        $search = trim((string) ($validated['search'] ?? ''));
        if ($search !== '') {
            $usersQuery->where(function ($query) use ($search) {
                $query->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $role = trim((string) ($validated['role'] ?? ''));
        if ($role !== '') {
            $usersQuery->whereHas('roles', function ($query) use ($role) {
                $query->where('name', $role);
            });
        }

        $verified = $validated['verified'] ?? null;
        if ($verified === 'verified') {
            $usersQuery->whereNotNull('email_verified_at');
        } elseif ($verified === 'unverified') {
            $usersQuery->whereNull('email_verified_at');
        }

        $users = $usersQuery
            ->paginate((int) ($validated['per_page'] ?? 10))
            ->withQueryString();

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
