<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\PermissionRegistrar;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    app(PermissionRegistrar::class)->forgetCachedPermissions();
});

test('admin management endpoints require authentication', function () {
    $this->getJson('/api/admin/users')->assertUnauthorized();
    $this->getJson('/api/admin/roles')->assertUnauthorized();
    $this->getJson('/api/admin/permissions')->assertUnauthorized();
});

test('authenticated user can crud permissions', function () {
    $authUser = User::factory()->create();
    $this->actingAs($authUser);

    $createResponse = $this->postJson('/api/admin/permissions', [
        'name' => 'users.view',
    ]);

    $createResponse->assertCreated()->assertJsonPath('name', 'users.view');

    /** @var Permission $permission */
    $permission = Permission::query()->firstOrFail();

    $this->putJson("/api/admin/permissions/{$permission->id}", [
        'name' => 'users.list',
    ])->assertOk()->assertJsonPath('name', 'users.list');

    $this->deleteJson("/api/admin/permissions/{$permission->id}")
        ->assertOk()
        ->assertJsonPath('message', 'Permission deleted successfully');
});

test('authenticated user can crud roles with permission sync', function () {
    $authUser = User::factory()->create();
    $this->actingAs($authUser);

    Permission::create(['name' => 'users.view', 'guard_name' => 'web']);
    Permission::create(['name' => 'users.update', 'guard_name' => 'web']);

    $createResponse = $this->postJson('/api/admin/roles', [
        'name' => 'manager',
        'permissions' => ['users.view'],
    ]);

    $createResponse->assertCreated()->assertJsonPath('name', 'manager');

    /** @var Role $role */
    $role = Role::query()->firstOrFail();
    expect($role->hasPermissionTo('users.view'))->toBeTrue();

    $this->putJson("/api/admin/roles/{$role->id}", [
        'name' => 'senior-manager',
        'permissions' => ['users.update'],
    ])->assertOk()->assertJsonPath('name', 'senior-manager');

    $role->refresh();
    expect($role->hasPermissionTo('users.update'))->toBeTrue();

    $this->deleteJson("/api/admin/roles/{$role->id}")
        ->assertOk()
        ->assertJsonPath('message', 'Role deleted successfully');
});

test('authenticated user can crud users with role assignment', function () {
    $authUser = User::factory()->create();
    $this->actingAs($authUser);

    Role::create(['name' => 'admin', 'guard_name' => 'web']);

    $createResponse = $this->postJson('/api/admin/users', [
        'name' => 'Managed User',
        'email' => 'managed@example.com',
        'password' => 'password123',
        'roles' => ['admin'],
    ]);

    $createResponse->assertCreated()->assertJsonPath('email', 'managed@example.com');

    $user = User::query()->where('email', 'managed@example.com')->firstOrFail();
    expect($user->hasRole('admin'))->toBeTrue();

    $this->putJson("/api/admin/users/{$user->id}", [
        'name' => 'Updated User',
        'email' => 'managed@example.com',
        'roles' => [],
    ])->assertOk()->assertJsonPath('name', 'Updated User');

    $user->refresh();
    expect($user->roles()->count())->toBe(0);

    $this->deleteJson("/api/admin/users/{$user->id}")
        ->assertOk()
        ->assertJsonPath('message', 'User deleted successfully');
});
