<?php

namespace App\Services\Chat;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;

class ConversationAccessService
{
    public function requireVisibleParticipant(Conversation $conversation, User $user): ConversationParticipant
    {
        $participant = $this->participantOrFail($conversation, $user);

        if ($participant->hidden_at !== null) {
            throw new AuthorizationException('Conversation is not accessible.');
        }

        return $participant;
    }

    public function requireAcceptedParticipant(Conversation $conversation, User $user): ConversationParticipant
    {
        $participant = $this->requireVisibleParticipant($conversation, $user);

        if ($participant->participant_state !== 'accepted') {
            throw new AuthorizationException('Conversation is not accepted yet.');
        }

        return $participant;
    }

    public function requirePendingParticipant(Conversation $conversation, User $user): ConversationParticipant
    {
        $participant = $this->requireVisibleParticipant($conversation, $user);

        if ($participant->participant_state !== 'pending') {
            throw new AuthorizationException('Conversation request is not pending.');
        }

        return $participant;
    }

    /**
     * @return array<int>
     */
    public function visibleRecipientIds(Conversation $conversation, ?int $excludeUserId = null): array
    {
        $query = $conversation->participants()
            ->whereNull('hidden_at')
            ->whereIn('participant_state', ['accepted', 'pending']);

        if ($excludeUserId !== null) {
            $query->where('user_id', '!=', $excludeUserId);
        }

        return $query->pluck('user_id')->map(fn ($id) => (int) $id)->all();
    }

    private function participantOrFail(Conversation $conversation, User $user): ConversationParticipant
    {
        $participant = $conversation->participants()
            ->where('user_id', $user->id)
            ->first();

        if (!$participant) {
            throw new AuthorizationException('You are not part of this conversation.');
        }

        return $participant;
    }
}
