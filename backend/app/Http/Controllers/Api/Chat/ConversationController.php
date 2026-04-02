<?php

namespace App\Http\Controllers\Api\Chat;

use App\Events\Chat\ConversationRequestUpdated;
use App\Events\Chat\ConversationUpdated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\ConversationRequestActionRequest;
use App\Http\Requests\Chat\StartConversationRequest;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\UserBlock;
use App\Models\User;
use App\Services\Chat\ConversationAccessService;
use App\Services\Chat\ConversationModerationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ConversationController extends Controller
{
    private const ONLINE_WINDOW_SECONDS = 90;

    public function store(StartConversationRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $authUser = $request->user();
        $moderationService = app(ConversationModerationService::class);

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
            $moderationService->ensureUsersCanStartDirectConversation($authUser, $recipient);

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
            'filter' => 'nullable|in:inbox,unread,online,requests,archived,blocked,all',
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

        $blockedConversationSubquery = UserBlock::query()
            ->selectRaw('1')
            ->whereColumn('user_blocks.conversation_id', 'conversation_participants.conversation_id')
            ->where('user_blocks.blocker_user_id', (int) $user->id);

        if ($filter === 'blocked') {
            $query->whereExists($blockedConversationSubquery);
        } else {
            $query->whereNotExists($blockedConversationSubquery);
        }

        if ($filter === 'inbox') {
            $query->whereIn('participant_state', ['accepted', 'pending'])
                ->whereNull('archived_at')
                ->whereNull('hidden_at');
        } elseif ($filter === 'unread') {
            $query->whereIn('participant_state', ['accepted', 'pending'])
                ->whereNull('archived_at')
                ->whereNull('hidden_at')
                ->where('unread_count', '>', 0);
        } elseif ($filter === 'online') {
            $onlineThreshold = now()->subSeconds(self::ONLINE_WINDOW_SECONDS);

            $query->where('participant_state', 'accepted')
                ->whereNull('archived_at')
                ->whereNull('hidden_at')
                ->whereHas('conversation', function (Builder $conversationQuery) use ($user, $onlineThreshold): void {
                    $conversationQuery
                        ->where('type', 'direct')
                        ->whereHas('participants', function (Builder $participantQuery) use ($user, $onlineThreshold): void {
                            $participantQuery
                                ->where('user_id', '!=', (int) $user->id)
                                ->whereNull('hidden_at')
                                ->where('participant_state', 'accepted')
                                ->whereHas('user', function (Builder $userQuery) use ($onlineThreshold): void {
                                    $userQuery->where('last_seen_at', '>=', $onlineThreshold);
                                });
                        });
                });
        } elseif ($filter === 'requests') {
            $query->where('participant_state', 'pending')
                ->whereNull('hidden_at');
        } elseif ($filter === 'archived') {
            $query->whereNotNull('archived_at')
                ->whereNull('hidden_at');
        } elseif ($filter === 'blocked') {
            $query->whereIn('participant_state', ['accepted', 'pending', 'declined']);
        } else {
            $query->whereNull('hidden_at');
        }

        $paginator = $query
            ->orderByDesc(
                Conversation::query()
                    ->select('last_message_at')
                    ->whereColumn('conversations.id', 'conversation_participants.conversation_id')
            )
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
        $blockedConversationIds = UserBlock::query()
            ->where('blocker_user_id', $viewerId)
            ->whereIn('conversation_id', $conversationIds)
            ->pluck('conversation_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $blockedLookup = array_fill_keys($blockedConversationIds, true);

        $paginator->setCollection(
            $paginator->getCollection()->map(function (ConversationParticipant $participant) use ($viewerId, $lastVisibleMessages, $blockedLookup) {
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
                    'muted_until' => $participant->muted_until,
                    'is_blocked' => isset($blockedLookup[(int) $participant->conversation_id]),
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

    public function show(
        Request $request,
        Conversation $conversation,
        ConversationAccessService $accessService,
        ConversationModerationService $moderationService
    ): JsonResponse
    {
        $participant = $accessService->requireVisibleParticipant($conversation, $request->user());
        $viewerUserId = (int) $request->user()->id;

        $conversation->load([
            'creator:id,name,email',
            'participants' => function ($query) use ($conversation): void {
                if ($conversation->type === 'group') {
                    $query
                        ->whereNull('hidden_at')
                        ->where('participant_state', 'accepted');
                }
            },
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
                'muted_until' => $participant->muted_until,
                'unread_count' => $participant->unread_count,
                'last_read_message_id' => $participant->last_read_message_id,
                'last_read_at' => $participant->last_read_at,
            ],
            'moderation' => $moderationService->getConversationModerationState($conversation, $request->user()),
        ]);
    }

    public function update(Request $request, Conversation $conversation, ConversationAccessService $accessService): JsonResponse
    {
        $participant = $accessService->requireAcceptedParticipant($conversation, $request->user());

        if ($conversation->type !== 'group') {
            throw ValidationException::withMessages([
                'conversation' => ['Only group conversations can be updated.'],
            ]);
        }

        if ($participant->role !== 'owner') {
            throw ValidationException::withMessages([
                'conversation' => ['Only group owners can update this conversation.'],
            ]);
        }

        $validated = $request->validate([
            'title' => 'sometimes|nullable|string|max:100',
            'description' => 'sometimes|nullable|string|max:1000',
            'avatar' => 'sometimes|nullable|image|max:5120',
        ]);

        if (!array_key_exists('title', $validated) && !array_key_exists('description', $validated) && !$request->hasFile('avatar')) {
            throw ValidationException::withMessages([
                'conversation' => ['Provide at least one field to update.'],
            ]);
        }

        $changes = [];
        $updates = [];

        if (array_key_exists('title', $validated)) {
            $title = trim((string) ($validated['title'] ?? ''));
            if ($title === '') {
                throw ValidationException::withMessages([
                    'title' => ['Group name is required.'],
                ]);
            }

            $updates['title'] = $title;
            $changes['title'] = $title;
        }

        if (array_key_exists('description', $validated)) {
            $description = $validated['description'];
            if (is_string($description)) {
                $description = trim($description);
            }

            $updates['description'] = $description !== '' ? $description : null;
            $changes['description'] = $updates['description'];
        }

        if ($request->hasFile('avatar')) {
            $newAvatarPath = $request->file('avatar')->store('chat/avatars', 'public');

            if ($conversation->avatar_path && Storage::disk('public')->exists($conversation->avatar_path)) {
                Storage::disk('public')->delete($conversation->avatar_path);
            }

            $updates['avatar_path'] = $newAvatarPath;
            $changes['avatar_path'] = $newAvatarPath;
        }

        $conversation->update($updates);

        $recipientIds = $accessService->visibleRecipientIds($conversation, (int) $request->user()->id);
        broadcast(new ConversationUpdated(
            (int) $conversation->id,
            $changes,
            $recipientIds
        ))->toOthers();

        return response()->json([
            'message' => 'Conversation updated successfully.',
            'conversation' => $conversation->fresh(),
        ]);
    }

    public function addParticipants(
        Request $request,
        Conversation $conversation,
        ConversationAccessService $accessService
    ): JsonResponse {
        $participant = $accessService->requireAcceptedParticipant($conversation, $request->user());

        if ($conversation->type !== 'group') {
            throw ValidationException::withMessages([
                'conversation' => ['Only group conversations can be updated.'],
            ]);
        }

        if ($participant->role !== 'owner') {
            throw ValidationException::withMessages([
                'conversation' => ['Only group owners can update members.'],
            ]);
        }

        $validated = $request->validate([
            'participant_ids' => 'required|array|min:1',
            'participant_ids.*' => 'integer|exists:users,id',
        ]);

        $incomingIds = collect($validated['participant_ids'])
            ->map(fn ($id) => (int) $id)
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($incomingIds === []) {
            throw ValidationException::withMessages([
                'participant_ids' => ['Select at least one user.'],
            ]);
        }

        $now = now();
        $changesApplied = false;

        foreach ($incomingIds as $userId) {
            $existingParticipant = $conversation->participants()
                ->where('user_id', $userId)
                ->first();

            if ($existingParticipant) {
                $shouldRestoreParticipant = $existingParticipant->hidden_at !== null
                    || $existingParticipant->participant_state !== 'accepted'
                    || $existingParticipant->archived_at !== null;

                if (!$shouldRestoreParticipant) {
                    continue;
                }

                $existingParticipant->update([
                    'role' => $existingParticipant->role === 'owner' ? 'owner' : 'member',
                    'participant_state' => 'accepted',
                    'accepted_at' => $now,
                    'declined_at' => null,
                    'hidden_at' => null,
                    'archived_at' => null,
                    'unread_count' => 0,
                ]);
                $changesApplied = true;
                continue;
            }

            $conversation->participants()->create([
                'user_id' => $userId,
                'role' => 'member',
                'participant_state' => 'accepted',
                'accepted_at' => $now,
                'declined_at' => null,
                'hidden_at' => null,
                'archived_at' => null,
            ]);
            $changesApplied = true;
        }

        if (!$changesApplied) {
            return response()->json([
                'message' => 'No new participants to add.',
                'conversation' => $conversation->fresh(['participants.user']),
            ]);
        }

        $recipientIds = $accessService->visibleRecipientIds($conversation, (int) $request->user()->id);
        broadcast(new ConversationUpdated(
            (int) $conversation->id,
            ['participants_updated' => true],
            $recipientIds
        ))->toOthers();

        return response()->json([
            'message' => 'Participants added successfully.',
            'conversation' => $conversation->fresh(['participants.user']),
        ]);
    }

    public function removeParticipant(
        Request $request,
        Conversation $conversation,
        User $user,
        ConversationAccessService $accessService
    ): JsonResponse {
        $participant = $accessService->requireAcceptedParticipant($conversation, $request->user());

        if ($conversation->type !== 'group') {
            throw ValidationException::withMessages([
                'conversation' => ['Only group conversations can be updated.'],
            ]);
        }

        if ($participant->role !== 'owner') {
            throw ValidationException::withMessages([
                'conversation' => ['Only group owners can update members.'],
            ]);
        }

        if ((int) $user->id === (int) $request->user()->id) {
            throw ValidationException::withMessages([
                'participant' => ['You cannot remove yourself from the group.'],
            ]);
        }

        $targetParticipant = $conversation->participants()
            ->where('user_id', $user->id)
            ->first();

        if (!$targetParticipant) {
            throw ValidationException::withMessages([
                'participant' => ['User is not part of this group.'],
            ]);
        }

        if ($targetParticipant->role === 'owner') {
            throw ValidationException::withMessages([
                'participant' => ['Owner cannot be removed.'],
            ]);
        }

        $targetParticipant->update([
            'participant_state' => 'declined',
            'declined_at' => now(),
            'hidden_at' => now(),
            'unread_count' => 0,
        ]);

        $recipientIds = $accessService->visibleRecipientIds($conversation, (int) $request->user()->id);
        broadcast(new ConversationUpdated(
            (int) $conversation->id,
            ['participants_updated' => true],
            $recipientIds
        ))->toOthers();

        return response()->json([
            'message' => 'Participant removed successfully.',
            'conversation' => $conversation->fresh(['participants.user']),
        ]);
    }

    public function updateParticipantRole(
        Request $request,
        Conversation $conversation,
        User $user,
        ConversationAccessService $accessService
    ): JsonResponse {
        $participant = $accessService->requireAcceptedParticipant($conversation, $request->user());

        if ($conversation->type !== 'group') {
            throw ValidationException::withMessages([
                'conversation' => ['Only group conversations can be updated.'],
            ]);
        }

        if ($participant->role !== 'owner') {
            throw ValidationException::withMessages([
                'conversation' => ['Only group owners can update member roles.'],
            ]);
        }

        $validated = $request->validate([
            'role' => 'required|string|in:owner',
        ]);

        if ((int) $user->id === (int) $request->user()->id) {
            throw ValidationException::withMessages([
                'participant' => ['Select another member to transfer ownership.'],
            ]);
        }

        $targetParticipant = $conversation->participants()
            ->where('user_id', $user->id)
            ->whereNull('hidden_at')
            ->where('participant_state', 'accepted')
            ->first();

        if (!$targetParticipant) {
            throw ValidationException::withMessages([
                'participant' => ['User must be an active group member.'],
            ]);
        }

        if ($validated['role'] === 'owner' && $targetParticipant->role !== 'owner') {
            DB::transaction(function () use ($participant, $targetParticipant): void {
                $participant->update([
                    'role' => 'member',
                ]);

                $targetParticipant->update([
                    'role' => 'owner',
                ]);
            });
        }

        $recipientIds = $accessService->visibleRecipientIds($conversation, (int) $request->user()->id);
        broadcast(new ConversationUpdated(
            (int) $conversation->id,
            [
                'participants_updated' => true,
                'owner_user_id' => (int) $targetParticipant->user_id,
            ],
            $recipientIds
        ))->toOthers();

        return response()->json([
            'message' => 'Ownership transferred successfully.',
            'conversation' => $conversation->fresh(['participants.user']),
        ]);
    }

    public function leave(
        Request $request,
        Conversation $conversation,
        ConversationAccessService $accessService
    ): JsonResponse {
        $participant = $accessService->requireAcceptedParticipant($conversation, $request->user());

        if ($conversation->type !== 'group') {
            throw ValidationException::withMessages([
                'conversation' => ['Only group conversations can be left.'],
            ]);
        }

        $successorUserId = null;

        DB::transaction(function () use ($conversation, $participant, &$successorUserId): void {
            if ($participant->role === 'owner') {
                $successor = $conversation->participants()
                    ->where('user_id', '!=', $participant->user_id)
                    ->whereNull('hidden_at')
                    ->where('participant_state', 'accepted')
                    ->orderBy('accepted_at')
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->first();

                if ($successor) {
                    $successor->update([
                        'role' => 'owner',
                    ]);
                    $successorUserId = (int) $successor->user_id;
                }
            }

            $participant->update([
                'role' => 'member',
                'participant_state' => 'declined',
                'declined_at' => now(),
                'hidden_at' => now(),
                'archived_at' => null,
                'unread_count' => 0,
            ]);
        });

        $recipientIds = $accessService->visibleRecipientIds($conversation, (int) $request->user()->id);
        broadcast(new ConversationUpdated(
            (int) $conversation->id,
            [
                'participants_updated' => true,
                'owner_user_id' => $successorUserId,
            ],
            $recipientIds
        ))->toOthers();

        return response()->json([
            'message' => 'Left group successfully.',
            'conversation_id' => $conversation->id,
            'owner_user_id' => $successorUserId,
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

    public function mute(Request $request, Conversation $conversation, ConversationAccessService $accessService): JsonResponse
    {
        $validated = $request->validate([
            'muted_until' => 'nullable|date|after:now',
        ]);

        $participant = $accessService->requireVisibleParticipant($conversation, $request->user());
        $mutedUntil = isset($validated['muted_until'])
            ? Carbon::parse((string) $validated['muted_until'])
            : now()->addHours(8);

        $participant->update([
            'muted_until' => $mutedUntil,
        ]);

        return response()->json([
            'message' => 'Conversation muted successfully.',
            'conversation_id' => $conversation->id,
            'muted_until' => $mutedUntil->toISOString(),
        ]);
    }

    public function unmute(Request $request, Conversation $conversation, ConversationAccessService $accessService): JsonResponse
    {
        $participant = $accessService->requireVisibleParticipant($conversation, $request->user());
        $participant->update(['muted_until' => null]);

        return response()->json([
            'message' => 'Conversation unmuted successfully.',
            'conversation_id' => $conversation->id,
            'muted_until' => null,
        ]);
    }

    public function block(
        Request $request,
        Conversation $conversation,
        ConversationAccessService $accessService,
        ConversationModerationService $moderationService
    ): JsonResponse {
        $accessService->requireVisibleParticipant($conversation, $request->user());
        $moderationService->blockConversation($conversation, $request->user());

        return response()->json([
            'message' => 'User blocked successfully.',
            'conversation_id' => $conversation->id,
        ]);
    }

    public function unblock(
        Request $request,
        Conversation $conversation,
        ConversationAccessService $accessService,
        ConversationModerationService $moderationService
    ): JsonResponse {
        $accessService->requireVisibleParticipant($conversation, $request->user());
        $moderationService->unblockConversation($conversation, $request->user());

        return response()->json([
            'message' => 'User unblocked successfully.',
            'conversation_id' => $conversation->id,
        ]);
    }

    public function destroy(
        Request $request,
        Conversation $conversation,
        ConversationAccessService $accessService
    ): JsonResponse {
        $participant = $accessService->requireVisibleParticipant($conversation, $request->user());

        $participant->update([
            'hidden_at' => now(),
            'archived_at' => null,
            'muted_until' => null,
            'unread_count' => 0,
        ]);

        return response()->json([
            'message' => 'Conversation deleted successfully.',
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
