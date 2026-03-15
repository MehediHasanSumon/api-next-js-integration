<?php

namespace App\Http\Controllers\Api\Chat;

use App\Events\Chat\ConversationRequestUpdated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\ConversationRequestActionRequest;
use App\Http\Requests\Chat\StartConversationRequest;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\User;
use App\Services\Chat\ConversationAccessService;
use Illuminate\Database\Eloquent\Builder;
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

        $participantIds = collect($validated['participant_ids'] ?? [])
            ->map(fn ($id) => (int) $id)
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        if (!empty($participantIds)) {
            $participantIds = array_values(array_diff($participantIds, [(int) $authUser->id]));
        }

        if (array_key_exists('participant_ids', $validated) && empty($participantIds)) {
            throw ValidationException::withMessages([
                'participant_ids' => ['Select at least one other user.'],
            ]);
        }

        $recipient = null;
        if (count($participantIds) === 1) {
            $recipient = User::query()->findOrFail($participantIds[0]);
        } elseif (empty($participantIds)) {
            $recipient = isset($validated['recipient_user_id'])
                ? User::query()->findOrFail((int) $validated['recipient_user_id'])
                : User::query()->where('email', $validated['recipient_email'])->firstOrFail();
        }

        if ($recipient && (int) $recipient->id === (int) $authUser->id) {
            throw ValidationException::withMessages([
                'recipient_user_id' => ['You cannot start a conversation with yourself.'],
            ]);
        }

        if (count($participantIds) > 1) {
            [$conversation, $created] = DB::transaction(function () use ($authUser, $participantIds, $validated) {
                $conversation = Conversation::query()->create([
                    'type' => 'group',
                    'created_by' => $authUser->id,
                    'title' => $validated['title'] ?? null,
                ]);

                $now = now();

                $conversation->participants()->create([
                    'user_id' => $authUser->id,
                    'role' => 'owner',
                    'participant_state' => 'accepted',
                    'accepted_at' => $now,
                    'declined_at' => null,
                    'hidden_at' => null,
                    'archived_at' => null,
                ]);

                $participants = User::query()
                    ->whereIn('id', $participantIds)
                    ->get(['id', 'name']);

                foreach ($participants as $participant) {
                    $conversation->participants()->create([
                        'user_id' => $participant->id,
                        'role' => 'member',
                        'participant_state' => 'accepted',
                        'accepted_at' => $now,
                        'declined_at' => null,
                        'hidden_at' => null,
                        'archived_at' => null,
                    ]);
                }

                if (empty($conversation->title)) {
                    $title = $participants->pluck('name')->filter()->take(3)->implode(', ');
                    $conversation->update([
                        'title' => $title !== '' ? $title : 'Group chat',
                    ]);
                }

                return [$conversation->fresh(), true];
            });
        } else {
            $recipient = $recipient ?? User::query()->findOrFail($participantIds[0] ?? null);

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
        }

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
                'conversation.participants:id,conversation_id,user_id',
                'conversation.participants.user:id,name,email,last_seen_at',
            ]);

        if ($filter === 'inbox') {
            $query->whereIn('participant_state', ['accepted', 'pending'])
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
        $conversationIds = $paginator->getCollection()
            ->pluck('conversation_id')
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();

        $lastVisibleMessages = $this->resolveLastVisibleMessages($conversationIds, $viewerId);

        $paginator->setCollection(
            $paginator->getCollection()->map(function (ConversationParticipant $participant) use ($viewerId, $lastVisibleMessages) {
                $conversation = $participant->conversation;
                $lastMessage = $lastVisibleMessages->get((int) $participant->conversation_id);
                $counterpart = $conversation?->participants
                    ?->first(fn (ConversationParticipant $item) => (int) $item->user_id !== $viewerId)
                    ?->user;

                return [
                    'conversation_id' => $participant->conversation_id,
                    'type' => $conversation?->type,
                    'title' => $conversation?->title,
                    'description' => $conversation?->description,
                    'avatar_path' => $conversation?->avatar_path,
                    'last_message_at' => $lastMessage?->created_at,
                    'participant_state' => $participant->participant_state,
                    'archived_at' => $participant->archived_at,
                    'unread_count' => $participant->unread_count,
                    'counterpart' => $counterpart ? [
                        'id' => $counterpart->id,
                        'name' => $counterpart->name,
                        'email' => $counterpart->email,
                    ] : null,
                    'last_message' => $this->serializeLastMessage($lastMessage),
                ];
            })
        );

        return response()->json($paginator);
    }

    public function show(Request $request, Conversation $conversation, ConversationAccessService $accessService): JsonResponse
    {
        $participant = $accessService->requireVisibleParticipant($conversation, $request->user());
        $viewerUserId = (int) $request->user()->id;

        $conversation->load([
            'creator:id,name,email',
            'participants.user:id,name,email,last_seen_at',
        ]);

        $lastMessage = $this->resolveLastVisibleMessages([(int) $conversation->id], $viewerUserId)->get((int) $conversation->id);
        $conversation->setRelation('lastMessage', $lastMessage);
        $conversation->last_message_at = $lastMessage?->created_at;

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

    private function formatReactionAggregates($reactionAggregates): array
    {
        if (!$reactionAggregates) {
            return [];
        }

        return collect($reactionAggregates)
            ->map(function ($item): array {
                return [
                    'emoji' => (string) $item->emoji,
                    'count' => (int) ($item->total ?? 0),
                    'reacted_by_me' => (bool) ($item->reacted_by_me ?? 0),
                ];
            })
            ->values()
            ->all();
    }

    private function resolveLastVisibleMessages(array $conversationIds, int $viewerUserId)
    {
        $normalizedConversationIds = collect($conversationIds)
            ->map(fn ($id) => (int) $id)
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($normalizedConversationIds === []) {
            return collect();
        }

        $latestVisibleIdsByConversation = Message::query()
            ->whereIn('conversation_id', $normalizedConversationIds)
            ->visibleToUser($viewerUserId)
            ->selectRaw('MAX(id) as id, conversation_id')
            ->groupBy('conversation_id')
            ->pluck('id', 'conversation_id');

        if ($latestVisibleIdsByConversation->isEmpty()) {
            return collect();
        }

        return Message::query()
            ->whereIn('id', $latestVisibleIdsByConversation->values()->all())
            ->visibleToUser($viewerUserId)
            ->withActiveReactionAggregates($viewerUserId)
            ->with('sender:id,name,email')
            ->get()
            ->keyBy('conversation_id');
    }

    private function serializeLastMessage(?Message $lastMessage): ?array
    {
        if (!$lastMessage) {
            return null;
        }

        return [
            'id' => $lastMessage->id,
            'message_type' => $lastMessage->message_type,
            'body' => $lastMessage->body,
            'created_at' => $lastMessage->created_at,
            'reactions_total' => (int) ($lastMessage->reactions_total ?? 0),
            'reaction_aggregates' => $this->formatReactionAggregates($lastMessage->reactionAggregates),
            'sender' => $lastMessage->sender ? [
                'id' => $lastMessage->sender->id,
                'name' => $lastMessage->sender->name,
                'email' => $lastMessage->sender->email,
            ] : null,
        ];
    }
}
