<?php

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

use function Pest\Laravel\actingAs;

uses(RefreshDatabase::class);

beforeEach(function () {
    config()->set('broadcasting.default', 'log');
});

function createCallHistoryConversation(User $owner, User $other): Conversation
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

test('starting a call creates a call history system message', function () {
    $caller = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createCallHistoryConversation($caller, $receiver);

    actingAs($caller)
        ->postJson("/api/chat/conversations/{$conversation->id}/calls/start", [
            'call_type' => 'audio',
        ])
        ->assertCreated()
        ->assertJsonPath('data.call_type', 'audio');

    $lastMessage = $conversation->fresh()->lastMessage()->firstOrFail();

    expect($lastMessage->message_type)->toBe('system');
    expect($lastMessage->body)->toBe('Audio call started');
    expect(data_get($lastMessage->metadata, 'system_kind'))->toBe('call');
    expect(data_get($lastMessage->metadata, 'call_history_event'))->toBe('started');
    expect(data_get($lastMessage->metadata, 'call_type'))->toBe('audio');
});

test('terminal call updates create matching call history system messages', function (
    string $terminalAction,
    string $expectedEvent,
    string $expectedBodyPrefix
) {
    $caller = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createCallHistoryConversation($caller, $receiver);

    $startResponse = actingAs($caller)
        ->postJson("/api/chat/conversations/{$conversation->id}/calls/start", [
            'call_type' => 'video',
        ])
        ->assertCreated();

    $callId = (int) $startResponse->json('data.id');

    if ($terminalAction === 'end') {
        actingAs($receiver)
            ->postJson("/api/chat/calls/{$callId}/accept")
            ->assertOk();

        actingAs($caller)
            ->postJson("/api/chat/calls/{$callId}/end")
            ->assertOk();
    } elseif ($terminalAction === 'decline') {
        actingAs($receiver)
            ->postJson("/api/chat/calls/{$callId}/decline")
            ->assertOk();
    } else {
        actingAs($caller)
            ->postJson("/api/chat/calls/{$callId}/miss")
            ->assertOk();
    }

    $lastMessage = $conversation->fresh()->lastMessage()->firstOrFail();

    expect($lastMessage->message_type)->toBe('system');
    expect($lastMessage->body)->toStartWith($expectedBodyPrefix);
    expect(data_get($lastMessage->metadata, 'system_kind'))->toBe('call');
    expect(data_get($lastMessage->metadata, 'call_history_event'))->toBe($expectedEvent);
    expect(data_get($lastMessage->metadata, 'call_type'))->toBe('video');
})->with([
    ['decline', 'declined', 'Video call declined'],
    ['miss', 'missed', 'Missed Video call'],
    ['end', 'ended', 'Video call ended'],
]);
