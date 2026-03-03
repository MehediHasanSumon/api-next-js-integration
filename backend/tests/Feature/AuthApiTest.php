<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

const SPA_ORIGIN = 'http://localhost:3000';

beforeEach(function () {
    config()->set('sanctum.stateful', ['localhost:3000']);
});

function statefulHeaders(string $refererPath = '/'): array
{
    return [
        'Accept' => 'application/json',
        'Origin' => SPA_ORIGIN,
        'Referer' => SPA_ORIGIN . $refererPath,
    ];
}

function csrfTokenPayload(): array
{
    $token = Str::random(40);

    return [
        'token' => $token,
        'session' => ['_token' => $token],
        'headers' => ['X-XSRF-TOKEN' => $token],
    ];
}

test('user endpoint requires authentication', function () {
    $this
        ->withHeaders(statefulHeaders('/dashboard'))
        ->getJson('/api/user')
        ->assertUnauthorized();
});

test('register endpoint creates user with csrf token', function () {
    $csrf = csrfTokenPayload();

    $response = $this
        ->withHeaders(array_merge(statefulHeaders('/register'), $csrf['headers']))
        ->withSession($csrf['session'])
        ->withCookie('XSRF-TOKEN', $csrf['token'])
        ->postJson('/api/register', [
            'name' => 'Jane Tester',
            'email' => 'jane@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

    $response
        ->assertOk()
        ->assertJsonPath('user.email', 'jane@example.com');

    $this->assertAuthenticated();
    $this->assertDatabaseHas('users', [
        'email' => 'jane@example.com',
    ]);
});

test('login succeeds and rotates session id', function () {
    User::factory()->create([
        'name' => 'John Auth',
        'email' => 'john@example.com',
        'password' => 'password123',
    ]);

    $csrf = csrfTokenPayload();
    $sessionIdBeforeLogin = session()->getId();

    $response = $this
        ->withHeaders(array_merge(statefulHeaders('/login'), $csrf['headers']))
        ->withSession($csrf['session'])
        ->withCookie('XSRF-TOKEN', $csrf['token'])
        ->postJson('/api/login', [
            'email' => 'john@example.com',
            'password' => 'password123',
        ]);

    $response
        ->assertOk()
        ->assertJsonPath('user.email', 'john@example.com');

    $this->assertAuthenticated();
    expect(session()->getId())->not->toBe($sessionIdBeforeLogin);
});

test('logout invalidates authenticated session', function () {
    User::factory()->create([
        'email' => 'logout@example.com',
        'password' => 'password123',
    ]);

    $loginCsrf = csrfTokenPayload();

    $this
        ->withHeaders(array_merge(statefulHeaders('/login'), $loginCsrf['headers']))
        ->withSession($loginCsrf['session'])
        ->withCookie('XSRF-TOKEN', $loginCsrf['token'])
        ->postJson('/api/login', [
            'email' => 'logout@example.com',
            'password' => 'password123',
        ])
        ->assertOk();

    $this
        ->withHeaders(statefulHeaders('/dashboard'))
        ->postJson('/api/logout')
        ->assertOk();

    app('auth')->forgetGuards();

    $this
        ->withHeaders(statefulHeaders('/dashboard'))
        ->getJson('/api/user')
        ->assertUnauthorized();
});

test('login fails with invalid credentials', function () {
    User::factory()->create([
        'email' => 'valid@example.com',
        'password' => 'password123',
    ]);

    $csrf = csrfTokenPayload();

    $this
        ->withHeaders(array_merge(statefulHeaders('/login'), $csrf['headers']))
        ->withSession($csrf['session'])
        ->withCookie('XSRF-TOKEN', $csrf['token'])
        ->postJson('/api/login', [
            'email' => 'valid@example.com',
            'password' => 'wrong-password',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('email');
});
