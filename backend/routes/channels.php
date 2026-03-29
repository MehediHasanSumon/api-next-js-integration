<?php

use App\Models\Call;
use App\Models\ConversationParticipant;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('user.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('conversation.{conversationId}', function ($user, int $conversationId) {
    return ConversationParticipant::query()
        ->where('conversation_id', $conversationId)
        ->where('user_id', $user->id)
        ->whereIn('participant_state', ['accepted', 'pending'])
        ->whereNull('hidden_at')
        ->exists();
});

Broadcast::channel('call.{callId}', function ($user, int $callId) {
    $call = Call::query()
        ->select(['id', 'conversation_id', 'caller_id', 'receiver_id'])
        ->find($callId);

    if (!$call) {
        return false;
    }

    $userId = (int) $user->id;

    if ($userId !== (int) $call->caller_id && $userId !== (int) $call->receiver_id) {
        return false;
    }

    return ConversationParticipant::query()
        ->where('conversation_id', (int) $call->conversation_id)
        ->where('user_id', $userId)
        ->whereIn('participant_state', ['accepted', 'pending'])
        ->whereNull('hidden_at')
        ->exists();
});
