<?php

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

use function Pest\Laravel\actingAs;

uses(RefreshDatabase::class);

beforeEach(function () {
    config()->set('broadcasting.default', 'log');
});

function createDirectConversation(User $owner, User $other): Conversation
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

test('accepted participant can send a chat message', function () {
    $sender = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createDirectConversation($sender, $receiver);

    actingAs($sender)
        ->postJson("/api/chat/conversations/{$conversation->id}/messages", [
            'message_type' => 'text',
            'body' => 'Hello from test',
        ])
        ->assertCreated()
        ->assertJsonPath('data.body', 'Hello from test');

    expect($conversation->fresh()->last_message_id)->not->toBeNull();
});

test('pending participant cannot send message before accepting request', function () {
    $sender = User::factory()->create();
    $receiver = User::factory()->create();

    [$lowId, $highId] = $sender->id < $receiver->id
        ? [$sender->id, $receiver->id]
        : [$receiver->id, $sender->id];

    $conversation = Conversation::query()->create([
        'type' => 'direct',
        'created_by' => $sender->id,
        'direct_user_low_id' => $lowId,
        'direct_user_high_id' => $highId,
    ]);

    $conversation->participants()->create([
        'user_id' => $sender->id,
        'participant_state' => 'accepted',
        'accepted_at' => now(),
    ]);

    $conversation->participants()->create([
        'user_id' => $receiver->id,
        'participant_state' => 'pending',
    ]);

    actingAs($receiver)
        ->postJson("/api/chat/conversations/{$conversation->id}/messages", [
            'message_type' => 'text',
            'body' => 'This should fail',
        ])
        ->assertForbidden();
});

test('participant can mark conversation as read', function () {
    $sender = User::factory()->create();
    $reader = User::factory()->create();
    $conversation = createDirectConversation($sender, $reader);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'Unread message',
    ]);

    $conversation->update([
        'last_message_id' => $message->id,
        'last_message_at' => $message->created_at,
    ]);

    $conversation->participants()
        ->where('user_id', $reader->id)
        ->update(['unread_count' => 3]);

    actingAs($reader)
        ->postJson("/api/chat/conversations/{$conversation->id}/messages/read", [
            'last_read_message_id' => $message->id,
        ])
        ->assertOk()
        ->assertJsonPath('data.last_read_message_id', $message->id);

    $participant = $conversation->participants()->where('user_id', $reader->id)->firstOrFail();
    expect((int) $participant->unread_count)->toBe(0);
});

test('pending conversation request can be declined', function () {
    $sender = User::factory()->create();
    $receiver = User::factory()->create();

    [$lowId, $highId] = $sender->id < $receiver->id
        ? [$sender->id, $receiver->id]
        : [$receiver->id, $sender->id];

    $conversation = Conversation::query()->create([
        'type' => 'direct',
        'created_by' => $sender->id,
        'direct_user_low_id' => $lowId,
        'direct_user_high_id' => $highId,
    ]);

    $conversation->participants()->create([
        'user_id' => $sender->id,
        'participant_state' => 'accepted',
        'accepted_at' => now(),
    ]);

    $conversation->participants()->create([
        'user_id' => $receiver->id,
        'participant_state' => 'pending',
    ]);

    actingAs($receiver)
        ->postJson("/api/chat/conversations/{$conversation->id}/request/respond", [
            'action' => 'decline',
        ])
        ->assertOk()
        ->assertJsonPath('participant_state', 'declined');

    $participant = $conversation->participants()->where('user_id', $receiver->id)->firstOrFail();
    expect($participant->hidden_at)->not->toBeNull();
});
