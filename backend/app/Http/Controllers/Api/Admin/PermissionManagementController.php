<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Permission;

class PermissionManagementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => 'nullable|string|max:255',
            'per_page' => 'nullable|integer|min:5|max:100',
            'paginate' => 'nullable|boolean',
        ]);

        $permissionsQuery = Permission::query()
            ->select(['id', 'name', 'guard_name', 'created_at'])
            ->orderBy('name');

        $search = trim((string) ($validated['search'] ?? ''));
        if ($search !== '') {
            $permissionsQuery->where('name', 'like', "%{$search}%");
        }

        if ($request->boolean('paginate')) {
            $permissions = $permissionsQuery
                ->paginate((int) ($validated['per_page'] ?? 10))
                ->withQueryString();

            return response()->json($permissions);
        }

        $permissions = $permissionsQuery->get();

        return response()->json($permissions);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:permissions,name',
        ]);

        $permission = Permission::create([
            'name' => $validated['name'],
            'guard_name' => 'web',
        ]);

        return response()->json($permission, 201);
    }

    public function update(Request $request, Permission $permission): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:permissions,name,' . $permission->id,
        ]);

        $permission->update([
            'name' => $validated['name'],
        ]);

        return response()->json($permission->fresh());
    }

    public function destroy(Permission $permission): JsonResponse
    {
        $permission->delete();

        return response()->json([
            'message' => 'Permission deleted successfully',
        ]);
    }

    public function bulkDestroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|distinct|exists:permissions,id',
        ]);

        $ids = collect($validated['ids'])->map(fn (int $id) => (int) $id)->values();

        $deleted = Permission::query()
            ->whereIn('id', $ids->all())
            ->delete();

        return response()->json([
            'message' => 'Permissions deleted successfully',
            'deleted' => $deleted,
        ]);
    }
}
