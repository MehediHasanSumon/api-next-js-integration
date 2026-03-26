<?php

namespace App\Services\Chat;

use App\Models\Conversation;
use App\Models\User;
use App\Models\UserBlock;
use Illuminate\Auth\Access\AuthorizationException;

class ConversationModerationService
{
    public function ensureUsersCanStartDirectConversation(User $actor, User $recipient): void
    {
        if ($this->isBlocked((int) $recipient->id, (int) $actor->id)) {
            throw new AuthorizationException('You cannot start a conversation because this user has blocked you.');
        }

        if ($this->isBlocked((int) $actor->id, (int) $recipient->id)) {
            throw new AuthorizationException('You have blocked this user. Unblock them before starting a conversation.');
        }
    }

    public function ensureConversationNotBlocked(Conversation $conversation, User $actor): void
    {
        if ($conversation->type !== 'direct') {
            return;
        }

        $counterpartId = $this->resolveCounterpartId($conversation, (int) $actor->id);
        if ($counterpartId === null) {
            return;
        }

        if ($this->isBlocked((int) $actor->id, $counterpartId)) {
            throw new AuthorizationException('You have blocked this user. Unblock them before using this conversation.');
        }

        if ($this->isBlocked($counterpartId, (int) $actor->id)) {
            throw new AuthorizationException('You cannot use this conversation because this user has blocked you.');
        }
    }

    public function blockConversation(Conversation $conversation, User $actor): void
    {
        if ($conversation->type !== 'direct') {
            throw new AuthorizationException('Only direct conversations can be blocked.');
        }

        $counterpartId = $this->resolveCounterpartId($conversation, (int) $actor->id);
        if ($counterpartId === null) {
            throw new AuthorizationException('Unable to determine the user to block.');
        }

        UserBlock::query()->updateOrCreate(
            [
                'blocker_user_id' => (int) $actor->id,
                'blocked_user_id' => $counterpartId,
            ],
            [
                'conversation_id' => (int) $conversation->id,
            ]
        );

        $conversation->participants()
            ->where('user_id', (int) $actor->id)
            ->update([
                'archived_at' => now(),
                'hidden_at' => null,
                'muted_until' => null,
                'unread_count' => 0,
            ]);
    }

    public function unblockConversation(Conversation $conversation, User $actor): void
    {
        if ($conversation->type !== 'direct') {
            throw new AuthorizationException('Only direct conversations can be unblocked.');
        }

        $counterpartId = $this->resolveCounterpartId($conversation, (int) $actor->id);
        if ($counterpartId === null) {
            throw new AuthorizationException('Unable to determine the user to unblock.');
        }

        UserBlock::query()
            ->where('blocker_user_id', (int) $actor->id)
            ->where('blocked_user_id', $counterpartId)
            ->delete();

        $conversation->participants()
            ->where('user_id', (int) $actor->id)
            ->update([
                'archived_at' => null,
            ]);
    }

    public function getConversationModerationState(Conversation $conversation, User $actor): array
    {
        if ($conversation->type !== 'direct') {
            return [
                'blocked_by_me' => false,
                'blocked_by_other' => false,
            ];
        }

        $counterpartId = $this->resolveCounterpartId($conversation, (int) $actor->id);
        if ($counterpartId === null) {
            return [
                'blocked_by_me' => false,
                'blocked_by_other' => false,
            ];
        }

        return [
            'blocked_by_me' => $this->isBlocked((int) $actor->id, $counterpartId),
            'blocked_by_other' => $this->isBlocked($counterpartId, (int) $actor->id),
        ];
    }

    public function isConversationBlockedByActor(Conversation $conversation, User $actor): bool
    {
        if ($conversation->type !== 'direct') {
            return false;
        }

        $counterpartId = $this->resolveCounterpartId($conversation, (int) $actor->id);
        if ($counterpartId === null) {
            return false;
        }

        return $this->isBlocked((int) $actor->id, $counterpartId);
    }

    private function resolveCounterpartId(Conversation $conversation, int $actorUserId): ?int
    {
        $lowId = $conversation->direct_user_low_id ? (int) $conversation->direct_user_low_id : null;
        $highId = $conversation->direct_user_high_id ? (int) $conversation->direct_user_high_id : null;

        if ($lowId === null || $highId === null) {
            return null;
        }

        if ($lowId === $actorUserId) {
            return $highId;
        }

        if ($highId === $actorUserId) {
            return $lowId;
        }

        return null;
    }

    private function isBlocked(int $blockerUserId, int $blockedUserId): bool
    {
        return UserBlock::query()
            ->where('blocker_user_id', $blockerUserId)
            ->where('blocked_user_id', $blockedUserId)
            ->exists();
    }
}
