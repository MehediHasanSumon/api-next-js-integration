<?php

use App\Events\Chat\CallAccepted;
use App\Events\Chat\CallDeclined;
use App\Events\Chat\CallEnded;
use App\Events\Chat\IncomingCall;
use App\Models\Conversation;
use App\Models\User;
use App\Models\UserBlock;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

use function Pest\Laravel\actingAs;

uses(RefreshDatabase::class);

beforeEach(function () {
    config()->set('broadcasting.default', 'log');
});

function createDirectCallConversation(User $owner, User $other): Conversation
{
    [$lowId, $highId] = $owner->id < $other->id
        ? [$owner->id, $other->id]
        : [$other->id, $owner->id];

    $conversation = Conversation::query()->create([
        'type' => 'direct',
        'created_by' => $owner->id,
        'direct_user_low_id' => $lowId,
        'direct_user_high_id' => $highId,
    ]);

    $conversation->participants()->create([
        'user_id' => $owner->id,
        'participant_state' => 'accepted',
        'accepted_at' => now(),
    ]);

    $conversation->participants()->create([
        'user_id' => $other->id,
        'participant_state' => 'accepted',
        'accepted_at' => now(),
    ]);

    return $conversation;
}

test('call start endpoint requires authentication', function () {
    $caller = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createDirectCallConversation($caller, $receiver);

    $this->postJson("/api/chat/conversations/{$conversation->id}/calls/start", [
        'call_type' => 'audio',
    ])
        ->assertUnauthorized()
        ->assertJsonPath('status', 401)
        ->assertJsonPath('error.code', 'UNAUTHENTICATED');
});

test('blocked conversation cannot start a call', function () {
    $caller = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createDirectCallConversation($caller, $receiver);

    UserBlock::query()->create([
        'blocker_user_id' => $caller->id,
        'blocked_user_id' => $receiver->id,
        'conversation_id' => $conversation->id,
    ]);

    actingAs($caller)
        ->postJson("/api/chat/conversations/{$conversation->id}/calls/start", [
            'call_type' => 'audio',
        ])
        ->assertForbidden()
        ->assertJsonPath('message', 'You have blocked this user. Unblock them before using this conversation.');
});

test('receiver can accept and either participant can end an accepted call', function () {
    $caller = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createDirectCallConversation($caller, $receiver);

    $startResponse = actingAs($caller)
        ->postJson("/api/chat/conversations/{$conversation->id}/calls/start", [
            'call_type' => 'video',
        ])
        ->assertCreated()
        ->assertJsonPath('data.status', 'ringing');

    $callId = (int) $startResponse->json('data.id');

    actingAs($receiver)
        ->postJson("/api/chat/calls/{$callId}/accept")
        ->assertOk()
        ->assertJsonPath('data.status', 'accepted');

    actingAs($caller)
        ->postJson("/api/chat/calls/{$callId}/end")
        ->assertOk()
        ->assertJsonPath('data.status', 'ended')
        ->assertJsonPath('data.end_reason', 'ended_by_user');

    $call = $conversation->calls()->firstOrFail();
    expect($call->status)->toBe('ended');
    expect($call->answered_at)->not->toBeNull();
    expect($call->ended_at)->not->toBeNull();
});

test('non receiver cannot accept a call', function () {
    $caller = User::factory()->create();
    $receiver = User::factory()->create();
    $intruder = User::factory()->create();
    $conversation = createDirectCallConversation($caller, $receiver);

    $conversation->participants()->create([
        'user_id' => $intruder->id,
        'participant_state' => 'accepted',
        'accepted_at' => now(),
        'hidden_at' => now(),
    ]);

    $startResponse = actingAs($caller)
        ->postJson("/api/chat/conversations/{$conversation->id}/calls/start", [
            'call_type' => 'audio',
        ])
        ->assertCreated();

    $callId = (int) $startResponse->json('data.id');

    actingAs($caller)
        ->postJson("/api/chat/calls/{$callId}/accept")
        ->assertStatus(422)
        ->assertJsonPath('errors.call.0', 'Only the receiver can accept this call.');
});

test('call lifecycle dispatches expected broadcast events', function () {
    Event::fake([
        IncomingCall::class,
        CallAccepted::class,
        CallDeclined::class,
        CallEnded::class,
    ]);

    $caller = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createDirectCallConversation($caller, $receiver);

    $startResponse = actingAs($caller)
        ->postJson("/api/chat/conversations/{$conversation->id}/calls/start", [
            'call_type' => 'audio',
        ])
        ->assertCreated();

    $callId = (int) $startResponse->json('data.id');

    Event::assertDispatched(IncomingCall::class, function (IncomingCall $event) use ($conversation, $receiver): bool {
        $channels = $event->broadcastOn();

        return $event->conversationId === (int) $conversation->id
            && $event->broadcastAs() === 'call.invite'
            && $channels[0] instanceof PrivateChannel
            && $channels[0]->name === "private-conversation.{$conversation->id}"
            && isset($channels[1])
            && $channels[1] instanceof PrivateChannel
            && $channels[1]->name === "private-user.{$receiver->id}";
    });

    actingAs($receiver)
        ->postJson("/api/chat/calls/{$callId}/accept")
        ->assertOk();

    Event::assertDispatched(CallAccepted::class, function (CallAccepted $event) use ($conversation, $caller): bool {
        $channels = $event->broadcastOn();

        return $event->conversationId === (int) $conversation->id
            && $event->broadcastAs() === 'call.accepted'
            && isset($channels[1])
            && $channels[1] instanceof PrivateChannel
            && $channels[1]->name === "private-user.{$caller->id}";
    });

    actingAs($caller)
        ->postJson("/api/chat/calls/{$callId}/end")
        ->assertOk();

    Event::assertDispatched(CallEnded::class, function (CallEnded $event) use ($conversation, $receiver): bool {
        $channels = $event->broadcastOn();

        return $event->conversationId === (int) $conversation->id
            && $event->broadcastAs() === 'call.ended'
            && isset($channels[1])
            && $channels[1] instanceof PrivateChannel
            && $channels[1]->name === "private-user.{$receiver->id}";
    });
});

test('caller can restart after a stale caller-owned active call exists', function () {
    $caller = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createDirectCallConversation($caller, $receiver);

    $firstStart = actingAs($caller)
        ->postJson("/api/chat/conversations/{$conversation->id}/calls/start", [
            'call_type' => 'audio',
        ])
        ->assertCreated()
        ->assertJsonPath('data.status', 'ringing');

    $firstCallId = (int) $firstStart->json('data.id');

    $secondStart = actingAs($caller)
        ->postJson("/api/chat/conversations/{$conversation->id}/calls/start", [
            'call_type' => 'video',
        ])
        ->assertCreated()
        ->assertJsonPath('data.status', 'ringing')
        ->assertJsonPath('data.call_type', 'video');

    $firstCall = $conversation->calls()->findOrFail($firstCallId);
    $secondCall = $conversation->calls()->findOrFail((int) $secondStart->json('data.id'));

    expect($firstCall->status)->toBe('ended');
    expect($firstCall->end_reason)->toBe('restarted');
    expect($secondCall->status)->toBe('ringing');
});
