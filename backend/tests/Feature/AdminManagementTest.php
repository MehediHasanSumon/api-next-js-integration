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

test('authenticated user can bulk delete permissions', function () {
    $authUser = User::factory()->create();
    $this->actingAs($authUser);

    $permissionA = Permission::create(['name' => 'reports.view', 'guard_name' => 'web']);
    $permissionB = Permission::create(['name' => 'reports.update', 'guard_name' => 'web']);

    $this->postJson('/api/admin/permissions/bulk-delete', [
        'ids' => [$permissionA->id, $permissionB->id],
    ])->assertOk()->assertJsonPath('deleted', 2);

    $this->assertDatabaseMissing('permissions', ['id' => $permissionA->id]);
    $this->assertDatabaseMissing('permissions', ['id' => $permissionB->id]);
});

test('authenticated user can filter and paginate users', function () {
    $authUser = User::factory()->create();
    $this->actingAs($authUser);

    Role::create(['name' => 'admin', 'guard_name' => 'web']);
    Role::create(['name' => 'manager', 'guard_name' => 'web']);

    $verifiedAdmin = User::factory()->create([
        'name' => 'Alice Verified',
        'email' => 'alice@example.com',
        'email_verified_at' => now(),
    ]);
    $verifiedAdmin->assignRole('admin');

    $unverifiedManager = User::factory()->create([
        'name' => 'Bob Pending',
        'email' => 'bob@example.com',
        'email_verified_at' => null,
    ]);
    $unverifiedManager->assignRole('manager');

    $response = $this->getJson('/api/admin/users?search=alice&role=admin&verified=verified&per_page=5&page=1');

    $response->assertOk()
        ->assertJsonPath('current_page', 1)
        ->assertJsonPath('last_page', 1)
        ->assertJsonPath('per_page', 5)
        ->assertJsonPath('total', 1)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.email', 'alice@example.com');
});

test('authenticated user can filter and paginate roles', function () {
    $authUser = User::factory()->create();
    $this->actingAs($authUser);

    Permission::create(['name' => 'users.view', 'guard_name' => 'web']);
    Permission::create(['name' => 'users.update', 'guard_name' => 'web']);

    $adminRole = Role::create(['name' => 'admin', 'guard_name' => 'web']);
    $adminRole->syncPermissions(['users.view']);

    $managerRole = Role::create(['name' => 'manager', 'guard_name' => 'web']);
    $managerRole->syncPermissions(['users.update']);

    $response = $this->getJson('/api/admin/roles?search=admin&permission=users.view&paginate=1&per_page=5&page=1');

    $response->assertOk()
        ->assertJsonPath('current_page', 1)
        ->assertJsonPath('last_page', 1)
        ->assertJsonPath('per_page', 5)
        ->assertJsonPath('total', 1)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'admin');
});

test('authenticated user can filter and paginate permissions', function () {
    $authUser = User::factory()->create();
    $this->actingAs($authUser);

    Permission::create(['name' => 'users.view', 'guard_name' => 'web']);
    Permission::create(['name' => 'users.update', 'guard_name' => 'web']);

    $response = $this->getJson('/api/admin/permissions?search=view&paginate=1&per_page=5&page=1');

    $response->assertOk()
        ->assertJsonPath('current_page', 1)
        ->assertJsonPath('last_page', 1)
        ->assertJsonPath('per_page', 5)
        ->assertJsonPath('total', 1)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'users.view');
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

test('bulk delete roles blocks admin role', function () {
    $authUser = User::factory()->create();
    $this->actingAs($authUser);

    $adminRole = Role::create(['name' => 'admin', 'guard_name' => 'web']);
    $managerRole = Role::create(['name' => 'manager', 'guard_name' => 'web']);

    $this->postJson('/api/admin/roles/bulk-delete', [
        'ids' => [$adminRole->id, $managerRole->id],
    ])->assertStatus(422)->assertJsonPath('message', 'Admin role cannot be deleted');

    $this->assertDatabaseHas('roles', ['id' => $adminRole->id]);
    $this->assertDatabaseHas('roles', ['id' => $managerRole->id]);
});

test('authenticated user can crud users with role assignment', function () {
    $authUser = User::factory()->create();
    $this->actingAs($authUser);

    Role::create(['name' => 'admin', 'guard_name' => 'web']);
    Role::create(['name' => 'manager', 'guard_name' => 'web']);

    $createResponse = $this->postJson('/api/admin/users', [
        'name' => 'Managed User',
        'email' => 'managed@example.com',
        'password' => 'password123',
        'password_confirmation' => 'password123',
        'email_verified' => true,
        'roles' => ['admin', 'manager'],
    ]);

    $createResponse->assertCreated()->assertJsonPath('email', 'managed@example.com');

    $user = User::query()->where('email', 'managed@example.com')->firstOrFail();
    expect($user->hasRole('admin'))->toBeTrue();
    expect($user->hasRole('manager'))->toBeTrue();
    expect($user->email_verified_at)->not->toBeNull();

    $this->putJson("/api/admin/users/{$user->id}", [
        'name' => 'Updated User',
        'email' => 'managed@example.com',
        'email_verified' => false,
        'roles' => [],
    ])->assertOk()->assertJsonPath('name', 'Updated User');

    $user->refresh();
    expect($user->roles()->count())->toBe(0);
    expect($user->email_verified_at)->toBeNull();

    $this->deleteJson("/api/admin/users/{$user->id}")
        ->assertOk()
        ->assertJsonPath('message', 'User deleted successfully');
});

test('authenticated user can bulk delete users except self', function () {
    $authUser = User::factory()->create();
    $this->actingAs($authUser);

    $userA = User::factory()->create();
    $userB = User::factory()->create();

    $this->postJson('/api/admin/users/bulk-delete', [
        'ids' => [$userA->id, $userB->id],
    ])->assertOk()->assertJsonPath('deleted', 2);

    $this->assertDatabaseMissing('users', ['id' => $userA->id]);
    $this->assertDatabaseMissing('users', ['id' => $userB->id]);
});

test('bulk delete users blocks deleting own account', function () {
    $authUser = User::factory()->create();
    $this->actingAs($authUser);

    $otherUser = User::factory()->create();

    $this->postJson('/api/admin/users/bulk-delete', [
        'ids' => [$authUser->id, $otherUser->id],
    ])->assertStatus(422)->assertJsonPath('message', 'You cannot delete your own account');

    $this->assertDatabaseHas('users', ['id' => $authUser->id]);
    $this->assertDatabaseHas('users', ['id' => $otherUser->id]);
});
