<?php

use App\Events\Chat\UserPresenceUpdated;
use App\Models\Conversation;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword as ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;

uses(RefreshDatabase::class);

const SPA_ORIGIN = 'http://localhost:3000';

beforeEach(function () {
    config()->set('sanctum.stateful', ['localhost:3000']);
    cache()->flush();
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

test('presence ping endpoint requires authentication', function () {
    $this
        ->withHeaders(statefulHeaders('/dashboard'))
        ->postJson('/api/presence/ping')
        ->assertUnauthorized();
});

test('presence ping updates last seen fields and returns status metadata', function () {
    $user = User::factory()->create([
        'last_seen_at' => null,
        'last_active_at' => null,
    ]);

    $response = $this
        ->actingAs($user)
        ->postJson('/api/presence/ping');

    $response
        ->assertOk()
        ->assertJsonPath('message', 'Presence heartbeat received.')
        ->assertJsonPath('data.user_id', $user->id)
        ->assertJsonPath('data.is_online', true)
        ->assertJsonPath('data.online_window_seconds', 90)
        ->assertJsonStructure([
            'server_time',
            'data' => ['last_seen_at', 'last_active_at'],
        ]);

    $user->refresh();

    expect($user->last_seen_at)->not->toBeNull();
    expect($user->last_active_at)->not->toBeNull();
});

test('presence ping dispatches realtime presence updated event', function () {
    Event::fake([UserPresenceUpdated::class]);

    $authUser = User::factory()->create();
    $counterpart = User::factory()->create();

    [$lowId, $highId] = $authUser->id < $counterpart->id
        ? [$authUser->id, $counterpart->id]
        : [$counterpart->id, $authUser->id];

    $conversation = Conversation::query()->create([
        'type' => 'direct',
        'created_by' => $authUser->id,
        'direct_user_low_id' => $lowId,
        'direct_user_high_id' => $highId,
    ]);

    $conversation->participants()->create([
        'user_id' => $authUser->id,
        'participant_state' => 'accepted',
        'accepted_at' => now(),
    ]);

    $conversation->participants()->create([
        'user_id' => $counterpart->id,
        'participant_state' => 'accepted',
        'accepted_at' => now(),
    ]);

    $this
        ->actingAs($authUser)
        ->postJson('/api/presence/ping')
        ->assertOk();

    Event::assertDispatched(UserPresenceUpdated::class, function (UserPresenceUpdated $event) use ($authUser, $conversation, $counterpart): bool {
        return $event->userId === (int) $authUser->id
            && $event->isOnline === true
            && $event->lastSeenAt !== null
            && in_array((int) $conversation->id, $event->conversationIds, true)
            && in_array((int) $counterpart->id, $event->recipientUserIds, true);
    });
});

test('presence ping dedupes online event while user remains online', function () {
    Event::fake([UserPresenceUpdated::class]);

    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/presence/ping')->assertOk();
    $this->actingAs($user)->postJson('/api/presence/ping')->assertOk();

    Event::assertDispatchedTimes(UserPresenceUpdated::class, 1);
});

test('presence status endpoint requires authentication', function () {
    $this
        ->withHeaders(statefulHeaders('/dashboard'))
        ->getJson('/api/presence/status?ids=1,2,3')
        ->assertUnauthorized();
});

test('presence status endpoint returns visible user statuses for requested ids', function () {
    $authUser = User::factory()->create([
        'last_seen_at' => now()->subMinutes(5),
    ]);
    $counterpart = User::factory()->create([
        'last_seen_at' => now()->subSeconds(20),
    ]);
    $stranger = User::factory()->create([
        'last_seen_at' => now()->subSeconds(15),
    ]);

    [$lowId, $highId] = $authUser->id < $counterpart->id
        ? [$authUser->id, $counterpart->id]
        : [$counterpart->id, $authUser->id];

    $conversation = Conversation::query()->create([
        'type' => 'direct',
        'created_by' => $authUser->id,
        'direct_user_low_id' => $lowId,
        'direct_user_high_id' => $highId,
    ]);

    $conversation->participants()->create([
        'user_id' => $authUser->id,
        'participant_state' => 'accepted',
        'accepted_at' => now(),
    ]);

    $conversation->participants()->create([
        'user_id' => $counterpart->id,
        'participant_state' => 'accepted',
        'accepted_at' => now(),
    ]);

    $response = $this
        ->actingAs($authUser)
        ->getJson("/api/presence/status?ids={$authUser->id},{$counterpart->id},{$stranger->id}");

    $response
        ->assertOk()
        ->assertJsonPath('message', 'Presence status fetched.')
        ->assertJsonPath('online_window_seconds', 90)
        ->assertJsonCount(2, 'data');

    $statusByUserId = collect($response->json('data'))->keyBy('user_id');

    expect($statusByUserId->has($authUser->id))->toBeTrue();
    expect($statusByUserId->has($counterpart->id))->toBeTrue();
    expect($statusByUserId->has($stranger->id))->toBeFalse();

    expect($statusByUserId->get($authUser->id)['is_online'])->toBeFalse();
    expect($statusByUserId->get($counterpart->id)['is_online'])->toBeTrue();
});

test('presence status infers offline event after timeout and dedupes repeated emits', function () {
    Event::fake([UserPresenceUpdated::class]);

    $authUser = User::factory()->create();
    $counterpart = User::factory()->create();

    [$lowId, $highId] = $authUser->id < $counterpart->id
        ? [$authUser->id, $counterpart->id]
        : [$counterpart->id, $authUser->id];

    $conversation = Conversation::query()->create([
        'type' => 'direct',
        'created_by' => $authUser->id,
        'direct_user_low_id' => $lowId,
        'direct_user_high_id' => $highId,
    ]);

    $conversation->participants()->create([
        'user_id' => $authUser->id,
        'participant_state' => 'accepted',
        'accepted_at' => now(),
    ]);

    $conversation->participants()->create([
        'user_id' => $counterpart->id,
        'participant_state' => 'accepted',
        'accepted_at' => now(),
    ]);

    // First ping emits online state for counterpart.
    $this
        ->actingAs($counterpart)
        ->postJson('/api/presence/ping')
        ->assertOk();

    // Timeout inference: simulate stale presence without hard disconnect signal.
    $counterpart->forceFill([
        'last_seen_at' => now()->subMinutes(5),
    ])->save();

    $this
        ->actingAs($authUser)
        ->getJson("/api/presence/status?ids={$counterpart->id}")
        ->assertOk()
        ->assertJsonPath('data.0.user_id', $counterpart->id)
        ->assertJsonPath('data.0.is_online', false);

    // Repeated status reads should not re-emit same offline event.
    $this
        ->actingAs($authUser)
        ->getJson("/api/presence/status?ids={$counterpart->id}")
        ->assertOk();

    Event::assertDispatchedTimes(UserPresenceUpdated::class, 2);
    Event::assertDispatched(UserPresenceUpdated::class, function (UserPresenceUpdated $event) use ($counterpart): bool {
        return $event->userId === (int) $counterpart->id && $event->isOnline === false;
    });
});
