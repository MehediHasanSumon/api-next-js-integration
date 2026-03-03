<?php

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword as ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;

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

test('forgot password endpoint sends reset link', function () {
    Notification::fake();

    $user = User::factory()->create([
        'email' => 'forgot@example.com',
    ]);

    $csrf = csrfTokenPayload();

    $response = $this
        ->withHeaders(array_merge(statefulHeaders('/forgot-password'), $csrf['headers']))
        ->withSession($csrf['session'])
        ->withCookie('XSRF-TOKEN', $csrf['token'])
        ->postJson('/api/forgot-password', [
            'email' => 'forgot@example.com',
        ]);

    $response
        ->assertOk()
        ->assertJsonPath('message', 'If your email exists, a reset link has been sent.');

    Notification::assertSentTo(
        $user,
        ResetPasswordNotification::class,
        function (ResetPasswordNotification $notification) use ($user): bool {
            $url = $notification->toMail($user)->actionUrl;

            return str_contains($url, '/reset-password?token=')
                && str_contains($url, 'email=forgot%40example.com');
        }
    );
});

test('forgot password endpoint returns generic success for unknown email', function () {
    Notification::fake();

    $csrf = csrfTokenPayload();

    $response = $this
        ->withHeaders(array_merge(statefulHeaders('/forgot-password'), $csrf['headers']))
        ->withSession($csrf['session'])
        ->withCookie('XSRF-TOKEN', $csrf['token'])
        ->postJson('/api/forgot-password', [
            'email' => 'missing@example.com',
        ]);

    $response
        ->assertOk()
        ->assertJsonPath('message', 'If your email exists, a reset link has been sent.');

    Notification::assertNothingSent();
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

test('login with remember me sets recaller cookie', function () {
    User::factory()->create([
        'email' => 'remember@example.com',
        'password' => 'password123',
    ]);

    $csrf = csrfTokenPayload();
    $recallerCookieName = Auth::guard('web')->getRecallerName();

    $response = $this
        ->withHeaders(array_merge(statefulHeaders('/login'), $csrf['headers']))
        ->withSession($csrf['session'])
        ->withCookie('XSRF-TOKEN', $csrf['token'])
        ->postJson('/api/login', [
            'email' => 'remember@example.com',
            'password' => 'password123',
            'remember' => true,
        ]);

    $response->assertOk();

    $cookieNames = collect($response->headers->getCookies())->map(fn ($cookie) => $cookie->getName());

    expect($cookieNames)->toContain($recallerCookieName);
});

test('reset password endpoint updates password with valid token', function () {
    $user = User::factory()->create([
        'email' => 'reset@example.com',
        'password' => 'old-password',
    ]);

    $token = Password::broker()->createToken($user);
    $csrf = csrfTokenPayload();

    $response = $this
        ->withHeaders(array_merge(statefulHeaders('/reset-password'), $csrf['headers']))
        ->withSession($csrf['session'])
        ->withCookie('XSRF-TOKEN', $csrf['token'])
        ->postJson('/api/reset-password', [
            'token' => $token,
            'email' => 'reset@example.com',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

    $response->assertOk();
    expect(Hash::check('new-password-123', $user->fresh()->password))->toBeTrue();
});

test('reset password endpoint fails with invalid token', function () {
    User::factory()->create([
        'email' => 'reset-invalid@example.com',
        'password' => 'old-password',
    ]);

    $csrf = csrfTokenPayload();

    $response = $this
        ->withHeaders(array_merge(statefulHeaders('/reset-password'), $csrf['headers']))
        ->withSession($csrf['session'])
        ->withCookie('XSRF-TOKEN', $csrf['token'])
        ->postJson('/api/reset-password', [
            'token' => 'invalid-token',
            'email' => 'reset-invalid@example.com',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

    $response
        ->assertUnprocessable()
        ->assertJsonValidationErrors('email');
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
