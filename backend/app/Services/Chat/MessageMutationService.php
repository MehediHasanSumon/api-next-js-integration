<?php

namespace App\Services\Chat;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;

class MessageMutationService
{
    public function __construct(
        private readonly ConversationAccessService $accessService,
        private readonly ChatMessagingService $messagingService
    ) {}

    public function forward(Message $message, User $actor, array $payload): Message
    {
        $sourceMessage = $this->resolveVisibleMessage(
            $message,
            $actor,
            [
                'sender:id,name,email',
                'attachments:id,message_id,attachment_type,original_name,mime_type,size_bytes,width,height,duration_ms',
            ],
            false
        );

        $targetConversation = Conversation::query()->findOrFail((int) $payload['target_conversation_id']);
        $targetParticipant = $this->accessService->requireAcceptedParticipant($targetConversation, $actor);

        return $this->messagingService->forwardMessage(
            $sourceMessage,
            $targetConversation,
            $actor,
            $targetParticipant,
            [
                'body' => $payload['body'] ?? null,
                'metadata' => $payload['metadata'] ?? null,
                'client_uid' => $payload['client_uid'] ?? null,
            ]
        );
    }

    public function toggleReaction(Message $message, User $actor, string $emoji): array
    {
        $reactableMessage = $this->resolveVisibleMessage($message, $actor, [], true);
        return $this->messagingService->toggleReaction($reactableMessage, $actor, $emoji);
    }

    public function removeReaction(Message $message, User $actor, string $emoji): array
    {
        $reactableMessage = $this->resolveVisibleMessage($message, $actor, [], true);
        return $this->messagingService->removeReaction($reactableMessage, $actor, $emoji);
    }

    public function removeForYou(Message $message, User $actor): array
    {
        $targetMessage = Message::query()
            ->whereKey($message->id)
            ->with('conversation:id')
            ->firstOrFail();

        $this->accessService->requireVisibleParticipant($targetMessage->conversation, $actor);

        return $this->messagingService->removeMessageForUser($targetMessage, $actor);
    }

    public function removeForEverywhere(Message $message, User $actor): array
    {
        $targetMessage = $this->resolveVisibleMessage($message, $actor, [], false);
        return $this->messagingService->removeMessageForEveryone($targetMessage, $actor);
    }

    private function resolveVisibleMessage(
        Message $message,
        User $actor,
        array $relations = [],
        bool $requireAcceptedParticipant = false
    ): Message {
        $query = Message::query()
            ->whereKey($message->id)
            ->visibleToUser((int) $actor->id)
            ->with(array_values(array_unique(array_merge(['conversation:id'], $relations))));

        $resolved = $query->firstOrFail();

        if ($requireAcceptedParticipant) {
            $this->accessService->requireAcceptedParticipant($resolved->conversation, $actor);
        } else {
            $this->accessService->requireVisibleParticipant($resolved->conversation, $actor);
        }

        return $resolved;
    }
}
