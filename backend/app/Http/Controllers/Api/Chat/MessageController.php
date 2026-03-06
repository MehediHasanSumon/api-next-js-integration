<?php

namespace App\Http\Controllers\Api\Chat;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\ForwardMessageRequest;
use App\Http\Requests\Chat\RemoveMessageForEverywhereRequest;
use App\Http\Requests\Chat\RemoveMessageForYouRequest;
use App\Http\Requests\Chat\RemoveMessageReactionRequest;
use App\Http\Requests\Chat\SendMessageRequest;
use App\Http\Requests\Chat\ToggleMessageReactionRequest;
use App\Models\Conversation;
use App\Models\Message;
use App\Services\Chat\ChatMessagingService;
use App\Services\Chat\ConversationAccessService;
use App\Services\Chat\MessageMutationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MessageController extends Controller
{
    public function index(
        Request $request,
        Conversation $conversation,
        ConversationAccessService $accessService
    ): JsonResponse {
        $viewer = $request->user();
        $accessService->requireVisibleParticipant($conversation, $viewer);

        $validated = $request->validate([
            'before_id' => 'nullable|integer|min:1',
            'limit' => 'nullable|integer|min:1|max:100',
        ]);

        $limit = (int) ($validated['limit'] ?? 30);
        $beforeId = $validated['before_id'] ?? null;

        $query = $this->buildVisibleMessageQuery($conversation, (int) $viewer->id);

        if ($beforeId !== null) {
            $query->where('id', '<', (int) $beforeId);
        }

        return response()->json([
            'conversation_id' => $conversation->id,
            'data' => $query->limit($limit)->get(),
        ]);
    }

    public function store(
        SendMessageRequest $request,
        Conversation $conversation,
        ConversationAccessService $accessService,
        ChatMessagingService $messagingService
    ): JsonResponse {
        $participant = $accessService->requireAcceptedParticipant($conversation, $request->user());

        $message = $messagingService->sendMessage(
            $conversation,
            $request->user(),
            $participant,
            $request->validated()
        );

        return response()->json([
            'message' => 'Message sent successfully.',
            'data' => $message,
        ], 201);
    }

    public function forward(
        ForwardMessageRequest $request,
        Message $message,
        MessageMutationService $mutationService
    ): JsonResponse {
        $actor = $request->user();
        $forwardedMessage = $mutationService->forward($message, $actor, $request->validated());

        return response()->json([
            'message' => 'Message forwarded successfully.',
            'data' => $forwardedMessage,
        ], 201);
    }

    public function markRead(
        Request $request,
        Conversation $conversation,
        ConversationAccessService $accessService,
        ChatMessagingService $messagingService
    ): JsonResponse {
        $validated = $request->validate([
            'last_read_message_id' => 'nullable|integer|min:1',
        ]);

        $participant = $accessService->requireAcceptedParticipant($conversation, $request->user());

        $payload = $messagingService->markAsRead(
            $conversation,
            $request->user(),
            $participant,
            $validated['last_read_message_id'] ?? null
        );

        return response()->json([
            'message' => 'Conversation marked as read.',
            'data' => $payload,
        ]);
    }

    public function toggleReaction(
        ToggleMessageReactionRequest $request,
        Message $message,
        MessageMutationService $mutationService
    ): JsonResponse {
        $actor = $request->user();
        $emoji = (string) $request->validated('emoji');

        $payload = $mutationService->toggleReaction($message, $actor, $emoji);

        return response()->json([
            'message' => 'Reaction updated successfully.',
            'data' => $payload,
        ]);
    }

    public function removeReaction(
        RemoveMessageReactionRequest $request,
        Message $message,
        MessageMutationService $mutationService
    ): JsonResponse {
        $actor = $request->user();
        $emoji = (string) $request->validated('emoji');

        $payload = $mutationService->removeReaction($message, $actor, $emoji);

        return response()->json([
            'message' => 'Reaction removed successfully.',
            'data' => $payload,
        ]);
    }

    public function removeForYou(
        RemoveMessageForYouRequest $request,
        Message $message,
        MessageMutationService $mutationService
    ): JsonResponse {
        $actor = $request->user();
        $payload = $mutationService->removeForYou($message, $actor);

        return response()->json([
            'message' => 'Message removed for you successfully.',
            'data' => $payload,
        ]);
    }

    public function removeForEverywhere(
        RemoveMessageForEverywhereRequest $request,
        Message $message,
        MessageMutationService $mutationService
    ): JsonResponse {
        $actor = $request->user();
        $payload = $mutationService->removeForEverywhere($message, $actor);

        return response()->json([
            'message' => 'Message removed for everyone successfully.',
            'data' => $payload,
        ]);
    }

    private function buildVisibleMessageQuery(Conversation $conversation, int $viewerUserId): HasMany
    {
        return $conversation->messages()
            ->visibleToUser($viewerUserId)
            ->withActiveReactionAggregates($viewerUserId)
            ->with([
                'sender:id,name,email',
                'attachments',
                'replyTo' => function ($replyQuery) use ($viewerUserId): void {
                    $replyQuery
                        ->select(['id', 'conversation_id', 'sender_id', 'message_type', 'body', 'created_at', 'deleted_at'])
                        ->visibleToUser($viewerUserId)
                        ->withActiveReactionAggregates($viewerUserId)
                        ->with('sender:id,name,email');
                },
            ])
            ->orderByDesc('id');
    }
}
