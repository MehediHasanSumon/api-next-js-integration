<?php

namespace App\Http\Controllers\Api\Chat;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\SendMessageRequest;
use App\Models\Conversation;
use App\Services\Chat\ChatMessagingService;
use App\Services\Chat\ConversationAccessService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class MessageController extends Controller
{
    public function index(
        Request $request,
        Conversation $conversation,
        ConversationAccessService $accessService
    ): JsonResponse {
        $accessService->requireVisibleParticipant($conversation, $request->user());

        $validated = $request->validate([
            'before_id' => 'nullable|integer|min:1',
            'limit' => 'nullable|integer|min:1|max:100',
        ]);

        $limit = (int) ($validated['limit'] ?? 30);
        $beforeId = $validated['before_id'] ?? null;

        $query = $conversation->messages()
            ->with([
                'sender:id,name,email',
                'attachments',
                'replyTo:id,conversation_id,sender_id,message_type,body,created_at',
                'replyTo.sender:id,name,email',
            ])
            ->whereNull('deleted_at')
            ->orderByDesc('id');

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
}
