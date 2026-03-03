<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Role;

class RoleManagementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => 'nullable|string|max:255',
            'permission' => 'nullable|string|max:255',
            'per_page' => 'nullable|integer|min:5|max:100',
            'paginate' => 'nullable|boolean',
        ]);

        $rolesQuery = Role::query()
            ->with(['permissions:id,name'])
            ->select(['id', 'name', 'guard_name', 'created_at'])
            ->orderBy('name');

        $search = trim((string) ($validated['search'] ?? ''));
        if ($search !== '') {
            $rolesQuery->where('name', 'like', "%{$search}%");
        }

        $permission = trim((string) ($validated['permission'] ?? ''));
        if ($permission !== '') {
            $rolesQuery->whereHas('permissions', function ($query) use ($permission) {
                $query->where('name', $permission);
            });
        }

        if ($request->boolean('paginate')) {
            $roles = $rolesQuery
                ->paginate((int) ($validated['per_page'] ?? 10))
                ->withQueryString();

            return response()->json($roles);
        }

        $roles = $rolesQuery->get();

        return response()->json($roles);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:roles,name',
            'permissions' => 'array',
            'permissions.*' => 'string|exists:permissions,name',
        ]);

        $role = Role::create([
            'name' => $validated['name'],
            'guard_name' => 'web',
        ]);

        if (isset($validated['permissions'])) {
            $role->syncPermissions($validated['permissions']);
        }

        return response()->json($role->load('permissions:id,name'), 201);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:roles,name,' . $role->id,
            'permissions' => 'array',
            'permissions.*' => 'string|exists:permissions,name',
        ]);

        $role->update([
            'name' => $validated['name'],
        ]);

        if (isset($validated['permissions'])) {
            $role->syncPermissions($validated['permissions']);
        }

        return response()->json($role->fresh()->load('permissions:id,name'));
    }

    public function destroy(Role $role): JsonResponse
    {
        if ($role->name === 'admin') {
            return response()->json([
                'message' => 'Admin role cannot be deleted',
            ], 422);
        }

        $role->delete();

        return response()->json([
            'message' => 'Role deleted successfully',
        ]);
    }
}
