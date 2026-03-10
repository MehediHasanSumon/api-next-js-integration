<?php

use App\Events\Chat\MessageSent;
use App\Events\Chat\MessageReactionUpdated;
use App\Events\Chat\MessageRemovedEverywhere;
use App\Events\Chat\MessageRemovedForUser;
use App\Models\Conversation;
use App\Models\User;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Event;
use Spatie\Permission\Models\Role;

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

test('mutation endpoint returns standardized 401 payload when unauthenticated', function () {
    $owner = User::factory()->create();
    $peer = User::factory()->create();
    $conversation = createDirectConversation($owner, $peer);
    $message = $conversation->messages()->create([
        'sender_id' => $owner->id,
        'message_type' => 'text',
        'body' => 'auth required',
    ]);

    $this->postJson("/api/chat/messages/{$message->id}/remove-for-you")
        ->assertUnauthorized()
        ->assertJsonPath('status', 401)
        ->assertJsonPath('error.code', 'UNAUTHENTICATED');
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
        ->assertForbidden()
        ->assertJsonPath('status', 403)
        ->assertJsonPath('error.code', 'FORBIDDEN')
        ->assertJsonPath('message', 'Conversation request is pending. Accept it before this action.');
});

test('archived participant receives specific archived error message for mutation', function () {
    $sender = User::factory()->create();
    $archivedUser = User::factory()->create();
    $conversation = createDirectConversation($sender, $archivedUser);

    $conversation->participants()
        ->where('user_id', $archivedUser->id)
        ->update(['archived_at' => now()]);

    actingAs($archivedUser)
        ->postJson("/api/chat/conversations/{$conversation->id}/messages", [
            'message_type' => 'text',
            'body' => 'Should be blocked by archived state',
        ])
        ->assertForbidden()
        ->assertJsonPath('status', 403)
        ->assertJsonPath('error.code', 'FORBIDDEN')
        ->assertJsonPath('message', 'Conversation is archived. Unarchive it before this action.');
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

test('accepted participant can forward visible message with optional comment', function () {
    $sender = User::factory()->create();
    $sourcePeer = User::factory()->create();
    $targetPeer = User::factory()->create();

    $sourceConversation = createDirectConversation($sender, $sourcePeer);
    $targetConversation = createDirectConversation($sender, $targetPeer);

    $sourceMessage = $sourceConversation->messages()->create([
        'sender_id' => $sourcePeer->id,
        'message_type' => 'text',
        'body' => 'Original source message',
    ]);

    actingAs($sender)
        ->postJson("/api/chat/messages/{$sourceMessage->id}/forward", [
            'target_conversation_id' => $targetConversation->id,
            'comment' => 'Please review this.',
            'client_uid' => (string) Str::uuid(),
        ])
        ->assertCreated()
        ->assertJsonPath('data.forwarded_from_message_id', $sourceMessage->id)
        ->assertJsonPath('data.forwarded_from_user_id', $sourcePeer->id)
        ->assertJsonPath('data.body', 'Please review this.')
        ->assertJsonPath('data.forwarded_snapshot.message_id', $sourceMessage->id)
        ->assertJsonPath('data.forwarded_snapshot.message_type', 'text');

    expect((int) $targetConversation->fresh()->last_message_id)->not->toBe(0);
});

test('forward dispatches realtime payload with forward metadata and client uid', function () {
    Event::fake([MessageSent::class]);

    $sender = User::factory()->create();
    $sourcePeer = User::factory()->create();
    $targetPeer = User::factory()->create();

    $sourceConversation = createDirectConversation($sender, $sourcePeer);
    $targetConversation = createDirectConversation($sender, $targetPeer);

    $sourceMessage = $sourceConversation->messages()->create([
        'sender_id' => $sourcePeer->id,
        'message_type' => 'text',
        'body' => 'Forward me realtime',
    ]);

    $clientUid = (string) Str::uuid();

    actingAs($sender)
        ->postJson("/api/chat/messages/{$sourceMessage->id}/forward", [
            'target_conversation_id' => $targetConversation->id,
            'body' => 'Forward payload test',
            'client_uid' => $clientUid,
        ])
        ->assertCreated();

    Event::assertDispatched(MessageSent::class, function (MessageSent $event) use ($targetConversation, $sourceMessage, $sourcePeer, $clientUid): bool {
        return $event->conversationId === (int) $targetConversation->id
            && $event->eventType === 'forwarded'
            && data_get($event->forwardMeta, 'forwarded_from_message_id') === (int) $sourceMessage->id
            && data_get($event->forwardMeta, 'forwarded_from_user_id') === (int) $sourcePeer->id
            && data_get($event->forwardMeta, 'client_uid') === $clientUid
            && data_get($event->forwardMeta, 'forwarded_snapshot.message_id') === (int) $sourceMessage->id
            && data_get($event->message, 'client_uid') === $clientUid;
    });
});

test('forward message fails when actor is not accepted in target conversation', function () {
    $actor = User::factory()->create();
    $sourcePeer = User::factory()->create();
    $targetOwner = User::factory()->create();
    $targetPeer = User::factory()->create();

    $sourceConversation = createDirectConversation($actor, $sourcePeer);
    $targetConversation = createDirectConversation($targetOwner, $targetPeer);

    $sourceMessage = $sourceConversation->messages()->create([
        'sender_id' => $sourcePeer->id,
        'message_type' => 'text',
        'body' => 'Source for forbidden forward',
    ]);

    actingAs($actor)
        ->postJson("/api/chat/messages/{$sourceMessage->id}/forward", [
            'target_conversation_id' => $targetConversation->id,
            'body' => 'Forward attempt',
        ])
        ->assertForbidden();
});

test('accepted participant can add and toggle same reaction', function () {
    $sender = User::factory()->create();
    $reactor = User::factory()->create();
    $conversation = createDirectConversation($sender, $reactor);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'React to me',
    ]);

    actingAs($reactor)
        ->postJson("/api/chat/messages/{$message->id}/reactions", [
            'emoji' => '👍',
        ])
        ->assertOk()
        ->assertJsonPath('data.action', 'added')
        ->assertJsonPath('data.message_id', $message->id)
        ->assertJsonPath('data.user_id', $reactor->id)
        ->assertJsonPath('data.reactions_total', 1)
        ->assertJsonPath('data.reaction_aggregates.0.emoji', '👍')
        ->assertJsonPath('data.reaction_aggregates.0.count', 1)
        ->assertJsonPath('data.reaction_aggregates.0.reacted_by_me', true);

    actingAs($reactor)
        ->postJson("/api/chat/messages/{$message->id}/reactions", [
            'emoji' => '👍',
        ])
        ->assertOk()
        ->assertJsonPath('data.action', 'removed')
        ->assertJsonPath('data.reactions_total', 0)
        ->assertJsonPath('data.reaction_aggregates', []);
});

test('reaction toggle broadcasts realtime reaction updated event with aggregates', function () {
    Event::fake([MessageReactionUpdated::class]);

    $sender = User::factory()->create();
    $reactor = User::factory()->create();
    $conversation = createDirectConversation($sender, $reactor);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'reaction event check',
    ]);

    actingAs($reactor)
        ->postJson("/api/chat/messages/{$message->id}/reactions", [
            'emoji' => "\u{1F44D}",
        ])
        ->assertOk();

    Event::assertDispatched(MessageReactionUpdated::class, function (MessageReactionUpdated $event) use ($conversation, $message, $reactor): bool {
        $channels = $event->broadcastOn();
        $channel = $channels[0] ?? null;

        return $event->conversationId === (int) $conversation->id
            && $event->messageId === (int) $message->id
            && $event->emoji === "\u{1F44D}"
            && $event->action === 'added'
            && $event->userId === (int) $reactor->id
            && $event->reactionsTotal === 1
            && $channel instanceof PrivateChannel
            && $channel->name === "private-conversation.{$conversation->id}";
    });
});

test('explicit remove reaction broadcasts realtime reaction updated event', function () {
    $sender = User::factory()->create();
    $reactor = User::factory()->create();
    $conversation = createDirectConversation($sender, $reactor);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'reaction remove event check',
    ]);

    actingAs($reactor)->postJson("/api/chat/messages/{$message->id}/reactions", [
        'emoji' => "\u{1F525}",
    ])->assertOk();

    Event::fake([MessageReactionUpdated::class]);

    actingAs($reactor)
        ->deleteJson("/api/chat/messages/{$message->id}/reactions", [
            'emoji' => "\u{1F525}",
        ])
        ->assertOk();

    Event::assertDispatched(MessageReactionUpdated::class, function (MessageReactionUpdated $event) use ($conversation, $message, $reactor): bool {
        return $event->conversationId === (int) $conversation->id
            && $event->messageId === (int) $message->id
            && $event->emoji === "\u{1F525}"
            && $event->action === 'removed'
            && $event->userId === (int) $reactor->id
            && $event->reactionsTotal === 0;
    });
});

test('reaction endpoint validates emoji payload', function () {
    $sender = User::factory()->create();
    $reactor = User::factory()->create();
    $conversation = createDirectConversation($sender, $reactor);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'Needs emoji validation',
    ]);

    actingAs($reactor)
        ->postJson("/api/chat/messages/{$message->id}/reactions", [
            'emoji' => 'hello',
        ])
        ->assertUnprocessable()
        ->assertJsonPath('status', 422)
        ->assertJsonPath('error.code', 'VALIDATION_ERROR')
        ->assertJsonValidationErrors(['emoji']);
});

test('pending participant cannot react to message', function () {
    $owner = User::factory()->create();
    $pendingUser = User::factory()->create();

    [$lowId, $highId] = $owner->id < $pendingUser->id
        ? [$owner->id, $pendingUser->id]
        : [$pendingUser->id, $owner->id];

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
        'user_id' => $pendingUser->id,
        'participant_state' => 'pending',
    ]);

    $message = $conversation->messages()->create([
        'sender_id' => $owner->id,
        'message_type' => 'text',
        'body' => 'Pending participant should not react',
    ]);

    actingAs($pendingUser)
        ->postJson("/api/chat/messages/{$message->id}/reactions", [
            'emoji' => "\u{1F525}",
        ])
        ->assertForbidden()
        ->assertJsonPath('status', 403)
        ->assertJsonPath('error.code', 'FORBIDDEN')
        ->assertJsonPath('message', 'Conversation request is pending. Accept it before this action.');
});

test('accepted participant can explicitly remove reaction via delete route', function () {
    $sender = User::factory()->create();
    $reactor = User::factory()->create();
    $conversation = createDirectConversation($sender, $reactor);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'Explicit remove reaction route',
    ]);

    actingAs($reactor)->postJson("/api/chat/messages/{$message->id}/reactions", [
        'emoji' => '🔥',
    ])->assertOk();

    actingAs($reactor)
        ->deleteJson("/api/chat/messages/{$message->id}/reactions", [
            'emoji' => '🔥',
        ])
        ->assertOk()
        ->assertJsonPath('data.action', 'removed')
        ->assertJsonPath('data.message_id', $message->id)
        ->assertJsonPath('data.reactions_total', 0)
        ->assertJsonPath('data.reaction_aggregates', []);
});

test('explicit remove reaction endpoint is idempotent for missing emoji reaction', function () {
    $sender = User::factory()->create();
    $reactor = User::factory()->create();
    $conversation = createDirectConversation($sender, $reactor);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'No reaction to remove yet',
    ]);

    actingAs($reactor)
        ->deleteJson("/api/chat/messages/{$message->id}/reactions", [
            'emoji' => '😂',
        ])
        ->assertOk()
        ->assertJsonPath('data.action', 'removed')
        ->assertJsonPath('data.reactions_total', 0)
        ->assertJsonPath('data.reaction_aggregates', []);
});

test('sender can edit message within time window and history is stored', function () {
    $sender = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createDirectConversation($sender, $receiver);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'Original body',
    ]);

    actingAs($sender)
        ->putJson("/api/chat/messages/{$message->id}", [
            'body' => 'Updated body',
        ])
        ->assertOk()
        ->assertJsonPath('data.body', 'Updated body');

    $message->refresh();

    expect($message->edited_at)->not->toBeNull();

    $this->assertDatabaseHas('message_edits', [
        'message_id' => $message->id,
        'editor_user_id' => $sender->id,
        'old_body' => 'Original body',
        'new_body' => 'Updated body',
    ]);
});

test('sender cannot edit message after edit window expires', function () {
    $sender = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createDirectConversation($sender, $receiver);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'Old message',
    ]);

    $message->forceFill([
        'created_at' => now()->subMinutes(25),
        'updated_at' => now()->subMinutes(25),
    ])->saveQuietly();

    actingAs($sender)
        ->putJson("/api/chat/messages/{$message->id}", [
            'body' => 'Too late',
        ])
        ->assertForbidden()
        ->assertJsonPath('error.code', 'FORBIDDEN');
});

test('non-sender cannot edit message', function () {
    $sender = User::factory()->create();
    $otherUser = User::factory()->create();
    $conversation = createDirectConversation($sender, $otherUser);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'Sender message',
    ]);

    actingAs($otherUser)
        ->putJson("/api/chat/messages/{$message->id}", [
            'body' => 'Not allowed',
        ])
        ->assertForbidden()
        ->assertJsonPath('error.code', 'FORBIDDEN');
});

test('participant can remove message for self only', function () {
    $sender = User::factory()->create();
    $actor = User::factory()->create();
    $otherParticipant = User::factory()->create();

    $conversation = createDirectConversation($sender, $actor);
    $conversation->participants()->create([
        'user_id' => $otherParticipant->id,
        'participant_state' => 'accepted',
        'accepted_at' => now(),
    ]);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'remove-for-you target',
    ]);

    actingAs($actor)
        ->postJson("/api/chat/messages/{$message->id}/remove-for-you")
        ->assertOk()
        ->assertJsonPath('data.conversation_id', $conversation->id)
        ->assertJsonPath('data.message_id', $message->id)
        ->assertJsonPath('data.mode', 'for_you')
        ->assertJsonPath('data.actor_user_id', $actor->id);

    $actorReceipt = $message->receipts()->where('user_id', $actor->id)->first();
    expect($actorReceipt)->not->toBeNull();
    expect($actorReceipt->hidden_at)->not->toBeNull();

    $otherReceipt = $message->receipts()->where('user_id', $otherParticipant->id)->first();
    expect($otherReceipt?->hidden_at)->toBeNull();

    expect($message->fresh())->not->toBeNull();
});

test('remove-for-you is idempotent and updates same user hidden state', function () {
    $sender = User::factory()->create();
    $actor = User::factory()->create();
    $conversation = createDirectConversation($sender, $actor);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'idempotent remove-for-you',
    ]);

    actingAs($actor)->postJson("/api/chat/messages/{$message->id}/remove-for-you")->assertOk();
    actingAs($actor)->postJson("/api/chat/messages/{$message->id}/remove-for-you")->assertOk();

    $receipts = $message->receipts()->where('user_id', $actor->id)->get();
    expect($receipts)->toHaveCount(1);
    expect($receipts->first()->hidden_at)->not->toBeNull();
});

test('remove-for-you broadcasts chat.message.removed on actor private channel', function () {
    Event::fake([MessageRemovedForUser::class]);

    $sender = User::factory()->create();
    $actor = User::factory()->create();
    $conversation = createDirectConversation($sender, $actor);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'broadcast remove-for-you check',
    ]);

    actingAs($actor)
        ->postJson("/api/chat/messages/{$message->id}/remove-for-you")
        ->assertOk();

    Event::assertDispatched(MessageRemovedForUser::class, function (MessageRemovedForUser $event) use ($conversation, $message, $actor): bool {
        $channels = $event->broadcastOn();
        $channel = $channels[0] ?? null;
        $payload = $event->broadcastWith();

        return $event->broadcastAs() === 'chat.message.removed'
            && $event->conversationId === (int) $conversation->id
            && $event->messageId === (int) $message->id
            && $event->actorUserId === (int) $actor->id
            && ($payload['mode'] ?? null) === 'for_you'
            && $channel instanceof PrivateChannel
            && $channel->name === "private-user.{$actor->id}";
    });
});

test('conversation inbox list recomputes last preview and unread after latest hidden-for-user message', function () {
    $sender = User::factory()->create();
    $viewer = User::factory()->create();
    $conversation = createDirectConversation($sender, $viewer);

    $olderMessage = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'Older visible message',
    ]);

    $latestMessage = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'Latest message to hide',
    ]);

    $conversation->update([
        'last_message_id' => $latestMessage->id,
        'last_message_at' => $latestMessage->created_at,
    ]);

    $conversation->participants()
        ->where('user_id', $viewer->id)
        ->update([
            'last_read_message_id' => null,
            'last_read_at' => null,
            'unread_count' => 2,
        ]);

    actingAs($viewer)
        ->postJson("/api/chat/messages/{$latestMessage->id}/remove-for-you")
        ->assertOk();

    $response = actingAs($viewer)
        ->getJson('/api/chat/conversations?filter=inbox')
        ->assertOk();

    $row = collect($response->json('data'))
        ->firstWhere('conversation_id', $conversation->id);

    expect($row)->not->toBeNull();
    expect((int) data_get($row, 'last_message.id'))->toBe((int) $olderMessage->id);
    expect((string) data_get($row, 'last_message.body'))->toBe('Older visible message');
    expect((int) data_get($row, 'unread_count'))->toBe(1);
});

test('conversation list shows forwarded message preview for target conversation', function () {
    $sender = User::factory()->create();
    $sourcePeer = User::factory()->create();
    $targetPeer = User::factory()->create();

    $sourceConversation = createDirectConversation($sender, $sourcePeer);
    $targetConversation = createDirectConversation($sender, $targetPeer);

    $sourceMessage = $sourceConversation->messages()->create([
        'sender_id' => $sourcePeer->id,
        'message_type' => 'text',
        'body' => 'Original source text',
    ]);

    $forwardResponse = actingAs($sender)
        ->postJson("/api/chat/messages/{$sourceMessage->id}/forward", [
            'target_conversation_id' => $targetConversation->id,
            'body' => 'Forwarded preview body',
            'client_uid' => (string) Str::uuid(),
        ])
        ->assertCreated();

    $forwardedMessageId = (int) $forwardResponse->json('data.id');

    $listResponse = actingAs($sender)
        ->getJson('/api/chat/conversations?filter=inbox')
        ->assertOk();

    $targetRow = collect($listResponse->json('data'))
        ->firstWhere('conversation_id', $targetConversation->id);

    expect($targetRow)->not->toBeNull();
    expect((int) data_get($targetRow, 'last_message.id'))->toBe($forwardedMessageId);
    expect((string) data_get($targetRow, 'last_message.body'))->toBe('Forwarded preview body');
});

test('remove-for-you keeps requests filter membership and recomputes unread', function () {
    $sender = User::factory()->create();
    $pendingReceiver = User::factory()->create();

    [$lowId, $highId] = $sender->id < $pendingReceiver->id
        ? [$sender->id, $pendingReceiver->id]
        : [$pendingReceiver->id, $sender->id];

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
        'user_id' => $pendingReceiver->id,
        'participant_state' => 'pending',
        'unread_count' => 1,
    ]);

    $message = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'Request inbox message',
    ]);

    $conversation->update([
        'last_message_id' => $message->id,
        'last_message_at' => $message->created_at,
    ]);

    actingAs($pendingReceiver)
        ->postJson("/api/chat/messages/{$message->id}/remove-for-you")
        ->assertOk();

    $requestListResponse = actingAs($pendingReceiver)
        ->getJson('/api/chat/conversations?filter=requests')
        ->assertOk();

    $requestRow = collect($requestListResponse->json('data'))
        ->firstWhere('conversation_id', $conversation->id);

    expect($requestRow)->not->toBeNull();
    expect((string) data_get($requestRow, 'participant_state'))->toBe('pending');
    expect((int) data_get($requestRow, 'unread_count'))->toBe(0);
});

test('remove-for-you keeps archived filter membership and recomputes unread', function () {
    $sender = User::factory()->create();
    $archivedViewer = User::factory()->create();
    $conversation = createDirectConversation($sender, $archivedViewer);

    $latestMessage = $conversation->messages()->create([
        'sender_id' => $sender->id,
        'message_type' => 'text',
        'body' => 'Archived hidden latest',
    ]);

    $conversation->update([
        'last_message_id' => $latestMessage->id,
        'last_message_at' => $latestMessage->created_at,
    ]);

    $conversation->participants()
        ->where('user_id', $archivedViewer->id)
        ->update([
            'archived_at' => now(),
            'unread_count' => 1,
            'last_read_message_id' => null,
        ]);

    actingAs($archivedViewer)
        ->postJson("/api/chat/messages/{$latestMessage->id}/remove-for-you")
        ->assertOk();

    $archivedListResponse = actingAs($archivedViewer)
        ->getJson('/api/chat/conversations?filter=archived')
        ->assertOk();

    $archivedRow = collect($archivedListResponse->json('data'))
        ->firstWhere('conversation_id', $conversation->id);

    expect($archivedRow)->not->toBeNull();
    expect(data_get($archivedRow, 'archived_at'))->not->toBeNull();
    expect((int) data_get($archivedRow, 'unread_count'))->toBe(0);
});

test('mutation endpoint returns standardized 404 payload for missing resource', function () {
    $user = User::factory()->create();

    actingAs($user)
        ->postJson('/api/chat/messages/999999/remove-for-you')
        ->assertNotFound()
        ->assertJsonPath('status', 404)
        ->assertJsonPath('error.code', 'NOT_FOUND');
});

test('message owner can remove message for everyone within time window', function () {
    $owner = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createDirectConversation($owner, $receiver);

    $message = $conversation->messages()->create([
        'sender_id' => $owner->id,
        'message_type' => 'text',
        'body' => 'delete me for everyone',
    ]);

    $message->attachments()->create([
        'uploader_id' => $owner->id,
        'attachment_type' => 'file',
        'storage_disk' => 'public',
        'storage_path' => 'chat/files/demo.txt',
        'original_name' => 'demo.txt',
        'mime_type' => 'text/plain',
        'extension' => 'txt',
        'size_bytes' => 42,
    ]);

    actingAs($owner)
        ->postJson("/api/chat/messages/{$message->id}/remove-for-everywhere")
        ->assertOk()
        ->assertJsonPath('data.mode', 'everywhere')
        ->assertJsonPath('data.message_id', $message->id)
        ->assertJsonPath('data.message.body', 'This message was removed.')
        ->assertJsonPath('data.message.message_type', 'system');

    $freshMessage = $message->fresh();
    expect($freshMessage->body)->toBe('This message was removed.');
    expect($freshMessage->message_type)->toBe('system');
    expect((bool) data_get($freshMessage->metadata, 'removed_for_everyone'))->toBeTrue();
    expect($freshMessage->attachments()->count())->toBe(0);
});

test('remove-for-everywhere broadcasts chat.message.removed on conversation private channel', function () {
    Event::fake([MessageRemovedEverywhere::class]);

    $owner = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createDirectConversation($owner, $receiver);

    $message = $conversation->messages()->create([
        'sender_id' => $owner->id,
        'message_type' => 'text',
        'body' => 'broadcast remove-for-everywhere check',
    ]);

    actingAs($owner)
        ->postJson("/api/chat/messages/{$message->id}/remove-for-everywhere")
        ->assertOk();

    Event::assertDispatched(MessageRemovedEverywhere::class, function (MessageRemovedEverywhere $event) use ($conversation, $message, $owner): bool {
        $channels = $event->broadcastOn();
        $channel = $channels[0] ?? null;
        $payload = $event->broadcastWith();

        return $event->broadcastAs() === 'chat.message.removed'
            && $event->conversationId === (int) $conversation->id
            && $event->messageId === (int) $message->id
            && $event->actorUserId === (int) $owner->id
            && ($payload['mode'] ?? null) === 'everywhere'
            && $channel instanceof PrivateChannel
            && $channel->name === "private-conversation.{$conversation->id}";
    });
});

test('message owner cannot remove message for everyone after time window expires', function () {
    $owner = User::factory()->create();
    $receiver = User::factory()->create();
    $conversation = createDirectConversation($owner, $receiver);

    $message = $conversation->messages()->create([
        'sender_id' => $owner->id,
        'message_type' => 'text',
        'body' => 'too old to remove',
    ]);

    $message->forceFill([
        'created_at' => now()->subMinutes(20),
        'updated_at' => now()->subMinutes(20),
    ])->saveQuietly();

    actingAs($owner)
        ->postJson("/api/chat/messages/{$message->id}/remove-for-everywhere")
        ->assertForbidden();
});

test('non-owner cannot remove message for everyone without admin role', function () {
    $owner = User::factory()->create();
    $otherUser = User::factory()->create();
    $conversation = createDirectConversation($owner, $otherUser);

    $message = $conversation->messages()->create([
        'sender_id' => $owner->id,
        'message_type' => 'text',
        'body' => 'not yours',
    ]);

    actingAs($otherUser)
        ->postJson("/api/chat/messages/{$message->id}/remove-for-everywhere")
        ->assertForbidden();
});

test('admin can remove message for everyone beyond owner time window', function () {
    $owner = User::factory()->create();
    $admin = User::factory()->create();
    Role::findOrCreate('admin');
    $admin->assignRole('admin');

    $conversation = createDirectConversation($owner, $admin);
    $message = $conversation->messages()->create([
        'sender_id' => $owner->id,
        'message_type' => 'text',
        'body' => 'admin moderation target',
    ]);

    $message->forceFill([
        'created_at' => now()->subHours(2),
        'updated_at' => now()->subHours(2),
    ])->saveQuietly();

    actingAs($admin)
        ->postJson("/api/chat/messages/{$message->id}/remove-for-everywhere")
        ->assertOk()
        ->assertJsonPath('data.mode', 'everywhere')
        ->assertJsonPath('data.message.body', 'This message was removed.');
});

