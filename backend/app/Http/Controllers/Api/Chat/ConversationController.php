<?php

namespace App\Http\Controllers\Api\Chat;

use App\Events\Chat\ConversationRequestUpdated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\ConversationRequestActionRequest;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Services\Chat\ConversationAccessService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ConversationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'filter' => 'nullable|in:inbox,requests,archived,all',
            'per_page' => 'nullable|integer|min:5|max:100',
        ]);

        $user = $request->user();
        $filter = $validated['filter'] ?? 'inbox';
        $perPage = (int) ($validated['per_page'] ?? 20);

        $query = ConversationParticipant::query()
            ->where('user_id', $user->id)
            ->with([
                'conversation:id,type,title,description,avatar_path,last_message_id,last_message_at,updated_at',
                'conversation.lastMessage:id,conversation_id,sender_id,message_type,body,created_at',
                'conversation.lastMessage.sender:id,name,email',
            ]);

        if ($filter === 'inbox') {
            $query->where('participant_state', 'accepted')
                ->whereNull('archived_at')
                ->whereNull('hidden_at');
        } elseif ($filter === 'requests') {
            $query->where('participant_state', 'pending')
                ->whereNull('hidden_at');
        } elseif ($filter === 'archived') {
            $query->whereNotNull('archived_at')
                ->whereNull('hidden_at');
        } else {
            $query->whereNull('hidden_at');
        }

        $paginator = $query
            ->orderByDesc('updated_at')
            ->paginate($perPage)
            ->withQueryString();

        $paginator->setCollection(
            $paginator->getCollection()->map(function (ConversationParticipant $participant) {
                $conversation = $participant->conversation;
                $lastMessage = $conversation?->lastMessage;

                return [
                    'conversation_id' => $participant->conversation_id,
                    'type' => $conversation?->type,
                    'title' => $conversation?->title,
                    'description' => $conversation?->description,
                    'avatar_path' => $conversation?->avatar_path,
                    'last_message_at' => $conversation?->last_message_at,
                    'participant_state' => $participant->participant_state,
                    'archived_at' => $participant->archived_at,
                    'unread_count' => $participant->unread_count,
                    'last_message' => $lastMessage ? [
                        'id' => $lastMessage->id,
                        'message_type' => $lastMessage->message_type,
                        'body' => $lastMessage->body,
                        'created_at' => $lastMessage->created_at,
                        'sender' => $lastMessage->sender ? [
                            'id' => $lastMessage->sender->id,
                            'name' => $lastMessage->sender->name,
                            'email' => $lastMessage->sender->email,
                        ] : null,
                    ] : null,
                ];
            })
        );

        return response()->json($paginator);
    }

    public function show(Request $request, Conversation $conversation, ConversationAccessService $accessService): JsonResponse
    {
        $participant = $accessService->requireVisibleParticipant($conversation, $request->user());

        $conversation->load([
            'creator:id,name,email',
            'lastMessage:id,conversation_id,sender_id,message_type,body,created_at',
            'lastMessage.sender:id,name,email',
            'participants.user:id,name,email',
        ]);

        return response()->json([
            'conversation' => $conversation,
            'participant' => [
                'participant_state' => $participant->participant_state,
                'archived_at' => $participant->archived_at,
                'unread_count' => $participant->unread_count,
                'last_read_message_id' => $participant->last_read_message_id,
                'last_read_at' => $participant->last_read_at,
            ],
        ]);
    }

    public function respondToRequest(
        ConversationRequestActionRequest $request,
        Conversation $conversation,
        ConversationAccessService $accessService
    ): JsonResponse {
        $participant = $accessService->requirePendingParticipant($conversation, $request->user());
        $action = $request->validated('action');

        if ($action === 'accept') {
            $participant->update([
                'participant_state' => 'accepted',
                'accepted_at' => now(),
                'declined_at' => null,
                'hidden_at' => null,
            ]);
        } else {
            $participant->update([
                'participant_state' => 'declined',
                'declined_at' => now(),
                'hidden_at' => now(),
                'unread_count' => 0,
            ]);
        }

        $recipientIds = $accessService->visibleRecipientIds($conversation, (int) $request->user()->id);
        broadcast(new ConversationRequestUpdated(
            (int) $conversation->id,
            (int) $request->user()->id,
            $action,
            $recipientIds
        ))->toOthers();

        return response()->json([
            'message' => $action === 'accept'
                ? 'Conversation request accepted successfully.'
                : 'Conversation request declined successfully.',
            'conversation_id' => $conversation->id,
            'participant_state' => $participant->participant_state,
        ]);
    }

    public function archive(Request $request, Conversation $conversation, ConversationAccessService $accessService): JsonResponse
    {
        $participant = $accessService->requireVisibleParticipant($conversation, $request->user());
        $participant->update(['archived_at' => now()]);

        return response()->json([
            'message' => 'Conversation archived successfully.',
            'conversation_id' => $conversation->id,
        ]);
    }

    public function unarchive(Request $request, Conversation $conversation, ConversationAccessService $accessService): JsonResponse
    {
        $participant = $accessService->requireVisibleParticipant($conversation, $request->user());
        $participant->update(['archived_at' => null]);

        return response()->json([
            'message' => 'Conversation unarchived successfully.',
            'conversation_id' => $conversation->id,
        ]);
    }
}
