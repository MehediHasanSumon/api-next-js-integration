<?php

namespace App\Http\Controllers\Api\Chat;

use App\Events\Chat\ConversationRequestUpdated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\ConversationRequestActionRequest;
use App\Http\Requests\Chat\StartConversationRequest;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\User;
use App\Services\Chat\ConversationAccessService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ConversationController extends Controller
{
    public function store(StartConversationRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $authUser = $request->user();

        $recipient = isset($validated['recipient_user_id'])
            ? User::query()->findOrFail((int) $validated['recipient_user_id'])
            : User::query()->where('email', $validated['recipient_email'])->firstOrFail();

        if ((int) $recipient->id === (int) $authUser->id) {
            throw ValidationException::withMessages([
                'recipient_user_id' => ['You cannot start a conversation with yourself.'],
            ]);
        }

        $lowId = min((int) $authUser->id, (int) $recipient->id);
        $highId = max((int) $authUser->id, (int) $recipient->id);

        [$conversation, $created] = DB::transaction(function () use ($authUser, $recipient, $lowId, $highId) {
            $conversation = Conversation::query()
                ->withTrashed()
                ->where('type', 'direct')
                ->where('direct_user_low_id', $lowId)
                ->where('direct_user_high_id', $highId)
                ->first();

            $created = false;

            if (!$conversation) {
                $conversation = Conversation::query()->create([
                    'type' => 'direct',
                    'created_by' => $authUser->id,
                    'direct_user_low_id' => $lowId,
                    'direct_user_high_id' => $highId,
                ]);
                $created = true;
            } elseif ($conversation->trashed()) {
                $conversation->restore();
            }

            $conversation->participants()->updateOrCreate(
                ['user_id' => $authUser->id],
                [
                    'role' => 'owner',
                    'participant_state' => 'accepted',
                    'accepted_at' => now(),
                    'declined_at' => null,
                    'hidden_at' => null,
                    'archived_at' => null,
                ]
            );

            $recipientParticipant = $conversation->participants()->where('user_id', $recipient->id)->first();

            if (!$recipientParticipant) {
                $conversation->participants()->create([
                    'user_id' => $recipient->id,
                    'role' => 'member',
                    'participant_state' => 'pending',
                    'accepted_at' => null,
                    'declined_at' => null,
                    'hidden_at' => null,
                    'archived_at' => null,
                ]);
            } elseif ($recipientParticipant->participant_state !== 'accepted') {
                $recipientParticipant->update([
                    'participant_state' => 'pending',
                    'accepted_at' => null,
                    'declined_at' => null,
                    'hidden_at' => null,
                    'archived_at' => null,
                ]);
            }

            return [$conversation->fresh(), $created];
        });

        return response()->json([
            'message' => $created ? 'Conversation created successfully.' : 'Conversation opened successfully.',
            'conversation_id' => $conversation->id,
            'created' => $created,
        ], $created ? 201 : 200);
    }

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
                'conversation.participants:id,conversation_id,user_id',
                'conversation.participants.user:id,name,email',
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

        $viewerId = (int) $user->id;

        $paginator->setCollection(
            $paginator->getCollection()->map(function (ConversationParticipant $participant) use ($viewerId) {
                $conversation = $participant->conversation;
                $lastMessage = $conversation?->lastMessage;
                $counterpart = $conversation?->participants
                    ?->first(fn (ConversationParticipant $item) => (int) $item->user_id !== $viewerId)
                    ?->user;

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
                    'counterpart' => $counterpart ? [
                        'id' => $counterpart->id,
                        'name' => $counterpart->name,
                        'email' => $counterpart->email,
                    ] : null,
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
