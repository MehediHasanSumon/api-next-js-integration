<?php

namespace App\Http\Controllers\Api\Chat;

use App\Events\Chat\CallAccepted;
use App\Events\Chat\CallDeclined;
use App\Events\Chat\CallEnded;
use App\Events\Chat\CallMissed;
use App\Events\Chat\IncomingCall;
use App\Events\Chat\WebRtcAnswerCreated;
use App\Events\Chat\WebRtcIceCandidateCreated;
use App\Events\Chat\WebRtcOfferCreated;
use App\Http\Controllers\Controller;
use App\Models\Call;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\User;
use App\Services\Chat\ChatMessagingService;
use App\Services\Chat\ConversationAccessService;
use App\Services\Chat\ConversationModerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CallController extends Controller
{
    public function start(
        Request $request,
        Conversation $conversation,
        ConversationAccessService $accessService,
        ConversationModerationService $moderationService,
        ChatMessagingService $messagingService
    ): JsonResponse {
        $actor = $request->user();
        $participant = $accessService->requireAcceptedParticipant($conversation, $actor);
        $this->ensureDirectConversation($conversation);
        $moderationService->ensureConversationNotBlocked($conversation, $actor);
        $this->ensureNoActiveCall($conversation);

        $validated = $request->validate([
            'call_type' => 'required|string|in:audio,video',
        ]);

        $receiver = $this->resolveCallableCounterpartUser($conversation, (int) $actor->id);
        if (!$receiver) {
            throw ValidationException::withMessages([
                'conversation' => ['The other participant is not currently eligible to receive calls in this conversation.'],
            ]);
        }

        $call = DB::transaction(function () use ($conversation, $actor, $receiver, $validated): Call {
            return Call::query()->create([
                'conversation_id' => (int) $conversation->id,
                'caller_id' => (int) $actor->id,
                'receiver_id' => (int) $receiver->id,
                'call_type' => (string) $validated['call_type'],
                'status' => 'ringing',
                'started_at' => now(),
            ]);
        });

        $callPayload = $this->serializeCall($call->fresh(['conversation', 'caller', 'receiver']));
        $this->recordCallHistoryMessage($messagingService, $conversation, $actor, $participant, $call, 'started');

        broadcast(new IncomingCall(
            (int) $conversation->id,
            $callPayload,
            [(int) $receiver->id]
        ))->toOthers();

        return response()->json([
            'message' => 'Call started successfully.',
            'data' => $callPayload,
        ], 201);
    }

    public function accept(
        Request $request,
        Call $call,
        ConversationAccessService $accessService
    ): JsonResponse {
        $actor = $request->user();
        $conversation = $call->conversation()->firstOrFail();
        $accessService->requireAcceptedParticipant($conversation, $actor);
        $this->ensureDirectConversation($conversation);
        $this->ensureReceiverAction($call, $actor, 'accept');
        $this->ensureCallStatus($call, ['initiated', 'ringing'], 'This call can no longer be accepted.');

        $call->update([
            'status' => 'accepted',
            'answered_at' => now(),
        ]);

        $callPayload = $this->serializeCall($call->fresh(['conversation', 'caller', 'receiver']));

        broadcast(new CallAccepted(
            (int) $conversation->id,
            $callPayload,
            [(int) $call->caller_id]
        ))->toOthers();

        return response()->json([
            'message' => 'Call accepted successfully.',
            'data' => $callPayload,
        ]);
    }

    public function decline(
        Request $request,
        Call $call,
        ConversationAccessService $accessService,
        ChatMessagingService $messagingService
    ): JsonResponse {
        $actor = $request->user();
        $conversation = $call->conversation()->firstOrFail();
        $participant = $accessService->requireAcceptedParticipant($conversation, $actor);
        $this->ensureDirectConversation($conversation);
        $this->ensureReceiverAction($call, $actor, 'decline');
        $this->ensureCallStatus($call, ['initiated', 'ringing'], 'This call can no longer be declined.');

        $call->update([
            'status' => 'declined',
            'ended_at' => now(),
            'end_reason' => 'declined',
        ]);

        $callPayload = $this->serializeCall($call->fresh(['conversation', 'caller', 'receiver']));
        $this->recordCallHistoryMessage($messagingService, $conversation, $actor, $participant, $call, 'declined');

        broadcast(new CallDeclined(
            (int) $conversation->id,
            $callPayload,
            [(int) $call->caller_id]
        ))->toOthers();

        return response()->json([
            'message' => 'Call declined successfully.',
            'data' => $callPayload,
        ]);
    }

    public function end(
        Request $request,
        Call $call,
        ConversationAccessService $accessService,
        ChatMessagingService $messagingService
    ): JsonResponse {
        $actor = $request->user();
        $conversation = $call->conversation()->firstOrFail();
        $participant = $accessService->requireAcceptedParticipant($conversation, $actor);
        $this->ensureDirectConversation($conversation);
        $this->ensureParticipantBelongsToCall($call, $actor);
        $this->ensureCallStatus($call, ['initiated', 'ringing', 'accepted'], 'This call is already closed.');

        $endedAt = now();
        $answeredAt = $call->answered_at;
        $durationSeconds = $answeredAt ? max(0, $answeredAt->diffInSeconds($endedAt)) : null;

        $call->update([
            'status' => 'ended',
            'ended_at' => $endedAt,
            'end_reason' => 'ended_by_user',
            'duration_seconds' => $durationSeconds,
        ]);

        $callPayload = $this->serializeCall($call->fresh(['conversation', 'caller', 'receiver']));
        $this->recordCallHistoryMessage($messagingService, $conversation, $actor, $participant, $call, 'ended');

        $recipientIds = array_values(array_filter([
            (int) $call->caller_id,
            $call->receiver_id !== null ? (int) $call->receiver_id : null,
        ], static fn ($id) => $id !== (int) $actor->id && $id !== 0));

        broadcast(new CallEnded(
            (int) $conversation->id,
            $callPayload,
            $recipientIds
        ))->toOthers();

        return response()->json([
            'message' => 'Call ended successfully.',
            'data' => $callPayload,
        ]);
    }

    public function miss(
        Request $request,
        Call $call,
        ConversationAccessService $accessService,
        ChatMessagingService $messagingService
    ): JsonResponse {
        $actor = $request->user();
        $conversation = $call->conversation()->firstOrFail();
        $participant = $accessService->requireAcceptedParticipant($conversation, $actor);
        $this->ensureDirectConversation($conversation);
        $this->ensureParticipantBelongsToCall($call, $actor);
        $this->ensureCallStatus($call, ['initiated', 'ringing'], 'This call can no longer be marked as missed.');

        $call->update([
            'status' => 'missed',
            'ended_at' => now(),
            'end_reason' => 'missed',
        ]);

        $callPayload = $this->serializeCall($call->fresh(['conversation', 'caller', 'receiver']));
        $this->recordCallHistoryMessage($messagingService, $conversation, $actor, $participant, $call, 'missed');
        $recipientIds = array_values(array_filter([
            (int) $call->caller_id,
            $call->receiver_id !== null ? (int) $call->receiver_id : null,
        ], static fn ($id) => $id !== 0));

        broadcast(new CallMissed(
            (int) $conversation->id,
            $callPayload,
            $recipientIds
        ))->toOthers();

        return response()->json([
            'message' => 'Call marked as missed successfully.',
            'data' => $callPayload,
        ]);
    }

    public function show(
        Request $request,
        Call $call,
        ConversationAccessService $accessService
    ): JsonResponse {
        $actor = $request->user();
        $conversation = $call->conversation()->firstOrFail();
        $accessService->requireAcceptedParticipant($conversation, $actor);
        $this->ensureDirectConversation($conversation);
        $this->ensureParticipantBelongsToCall($call, $actor);

        return response()->json([
            'data' => $this->serializeCall($call->fresh(['conversation', 'caller', 'receiver'])),
        ]);
    }

    public function sendOffer(
        Request $request,
        Call $call,
        ConversationAccessService $accessService
    ): JsonResponse {
        $actor = $request->user();
        $conversation = $call->conversation()->firstOrFail();
        $accessService->requireAcceptedParticipant($conversation, $actor);
        $this->ensureDirectConversation($conversation);
        $this->ensureCallStatus($call, ['accepted'], 'Offer can only be sent for an accepted call.');

        if ((int) $call->caller_id !== (int) $actor->id) {
            throw ValidationException::withMessages([
                'call' => ['Only the caller can send the initial WebRTC offer.'],
            ]);
        }

        $validated = $request->validate([
            'type' => 'required|string|in:offer',
            'sdp' => 'required|string',
        ]);

        $callPayload = $this->serializeCall($call->fresh(['conversation', 'caller', 'receiver']));
        $signalPayload = [
            'type' => (string) $validated['type'],
            'sdp' => (string) $validated['sdp'],
            'from_user_id' => (int) $actor->id,
            'to_user_id' => (int) $call->receiver_id,
            'call_id' => (int) $call->id,
        ];

        broadcast(new WebRtcOfferCreated(
            (int) $conversation->id,
            $callPayload,
            $signalPayload,
            [(int) $call->receiver_id]
        ))->toOthers();

        return response()->json([
            'message' => 'WebRTC offer sent successfully.',
            'data' => [
                'call' => $callPayload,
                'signal' => $signalPayload,
            ],
        ]);
    }

    public function sendAnswer(
        Request $request,
        Call $call,
        ConversationAccessService $accessService
    ): JsonResponse {
        $actor = $request->user();
        $conversation = $call->conversation()->firstOrFail();
        $accessService->requireAcceptedParticipant($conversation, $actor);
        $this->ensureDirectConversation($conversation);
        $this->ensureCallStatus($call, ['accepted'], 'Answer can only be sent for an accepted call.');

        if ((int) $call->receiver_id !== (int) $actor->id) {
            throw ValidationException::withMessages([
                'call' => ['Only the receiver can send the WebRTC answer.'],
            ]);
        }

        $validated = $request->validate([
            'type' => 'required|string|in:answer',
            'sdp' => 'required|string',
        ]);

        $callPayload = $this->serializeCall($call->fresh(['conversation', 'caller', 'receiver']));
        $signalPayload = [
            'type' => (string) $validated['type'],
            'sdp' => (string) $validated['sdp'],
            'from_user_id' => (int) $actor->id,
            'to_user_id' => (int) $call->caller_id,
            'call_id' => (int) $call->id,
        ];

        broadcast(new WebRtcAnswerCreated(
            (int) $conversation->id,
            $callPayload,
            $signalPayload,
            [(int) $call->caller_id]
        ))->toOthers();

        return response()->json([
            'message' => 'WebRTC answer sent successfully.',
            'data' => [
                'call' => $callPayload,
                'signal' => $signalPayload,
            ],
        ]);
    }

    public function sendIceCandidate(
        Request $request,
        Call $call,
        ConversationAccessService $accessService
    ): JsonResponse {
        $actor = $request->user();
        $conversation = $call->conversation()->firstOrFail();
        $accessService->requireAcceptedParticipant($conversation, $actor);
        $this->ensureDirectConversation($conversation);
        $this->ensureParticipantBelongsToCall($call, $actor);
        $this->ensureCallStatus($call, ['accepted'], 'ICE candidates can only be sent for an accepted call.');

        $validated = $request->validate([
            'candidate' => 'required|string',
            'sdp_mid' => 'nullable|string',
            'sdp_m_line_index' => 'nullable|integer|min:0',
            'username_fragment' => 'nullable|string',
        ]);

        $targetUserId = (int) $actor->id === (int) $call->caller_id
            ? (int) $call->receiver_id
            : (int) $call->caller_id;

        $callPayload = $this->serializeCall($call->fresh(['conversation', 'caller', 'receiver']));
        $signalPayload = [
            'candidate' => (string) $validated['candidate'],
            'sdp_mid' => $validated['sdp_mid'] ?? null,
            'sdp_m_line_index' => $validated['sdp_m_line_index'] ?? null,
            'username_fragment' => $validated['username_fragment'] ?? null,
            'from_user_id' => (int) $actor->id,
            'to_user_id' => $targetUserId,
            'call_id' => (int) $call->id,
        ];

        broadcast(new WebRtcIceCandidateCreated(
            (int) $conversation->id,
            $callPayload,
            $signalPayload,
            [$targetUserId]
        ))->toOthers();

        return response()->json([
            'message' => 'WebRTC ICE candidate sent successfully.',
            'data' => [
                'call' => $callPayload,
                'signal' => $signalPayload,
            ],
        ]);
    }

    private function ensureDirectConversation(Conversation $conversation): void
    {
        if ($conversation->type !== 'direct') {
            throw ValidationException::withMessages([
                'conversation' => ['Calls are only supported in direct conversations in phase 1.'],
            ]);
        }
    }

    private function ensureNoActiveCall(Conversation $conversation): void
    {
        $activeCallExists = $conversation->calls()
            ->whereIn('status', ['initiated', 'ringing', 'accepted'])
            ->exists();

        if ($activeCallExists) {
            throw ValidationException::withMessages([
                'conversation' => ['There is already an active call in this conversation.'],
            ]);
        }
    }

    private function resolveCallableCounterpartUser(Conversation $conversation, int $actorUserId): ?User
    {
        $counterpartParticipant = $conversation->participants()
            ->where('user_id', '!=', $actorUserId)
            ->whereNull('hidden_at')
            ->whereNull('archived_at')
            ->where('participant_state', 'accepted')
            ->first();

        if (!$counterpartParticipant) {
            return null;
        }

        return User::query()->find((int) $counterpartParticipant->user_id);
    }

    private function ensureReceiverAction(Call $call, User $actor, string $action): void
    {
        if ((int) $call->receiver_id !== (int) $actor->id) {
            throw ValidationException::withMessages([
                'call' => ["Only the receiver can {$action} this call."],
            ]);
        }
    }

    private function ensureParticipantBelongsToCall(Call $call, User $actor): void
    {
        $actorId = (int) $actor->id;

        if ($actorId !== (int) $call->caller_id && $actorId !== (int) $call->receiver_id) {
            throw ValidationException::withMessages([
                'call' => ['You are not part of this call.'],
            ]);
        }
    }

    /**
     * @param array<int, string> $allowedStatuses
     */
    private function ensureCallStatus(Call $call, array $allowedStatuses, string $message): void
    {
        if (!in_array((string) $call->status, $allowedStatuses, true)) {
            throw ValidationException::withMessages([
                'call' => [$message],
            ]);
        }
    }

    private function serializeCall(Call $call): array
    {
        return [
            'id' => $call->id,
            'conversation_id' => $call->conversation_id,
            'caller_id' => $call->caller_id,
            'receiver_id' => $call->receiver_id,
            'call_type' => $call->call_type,
            'status' => $call->status,
            'started_at' => $call->started_at,
            'answered_at' => $call->answered_at,
            'ended_at' => $call->ended_at,
            'duration_seconds' => $call->duration_seconds,
            'end_reason' => $call->end_reason,
            'metadata' => $call->metadata,
            'created_at' => $call->created_at,
            'updated_at' => $call->updated_at,
            'conversation' => $call->conversation ? [
                'id' => $call->conversation->id,
                'type' => $call->conversation->type,
            ] : null,
            'caller' => $call->caller ? [
                'id' => $call->caller->id,
                'name' => $call->caller->name,
                'email' => $call->caller->email,
            ] : null,
            'receiver' => $call->receiver ? [
                'id' => $call->receiver->id,
                'name' => $call->receiver->name,
                'email' => $call->receiver->email,
            ] : null,
        ];
    }

    private function recordCallHistoryMessage(
        ChatMessagingService $messagingService,
        Conversation $conversation,
        User $actor,
        ConversationParticipant $participant,
        Call $call,
        string $event
    ): void {
        $messagingService->sendSystemMessage(
            $conversation,
            $actor,
            $participant,
            $this->formatCallHistoryBody($call, $event),
            [
                'system_kind' => 'call',
                'call_history_event' => $event,
                'call_id' => (int) $call->id,
                'call_type' => (string) $call->call_type,
                'call_status' => (string) $call->status,
                'duration_seconds' => $call->duration_seconds,
                'end_reason' => $call->end_reason,
            ]
        );
    }

    private function formatCallHistoryBody(Call $call, string $event): string
    {
        $callTypeLabel = (string) $call->call_type === 'video' ? 'Video call' : 'Audio call';

        return match ($event) {
            'started' => "{$callTypeLabel} started",
            'declined' => "{$callTypeLabel} declined",
            'missed' => "Missed {$callTypeLabel}",
            'ended' => $call->duration_seconds !== null && $call->duration_seconds > 0
                ? sprintf('%s ended (%s)', $callTypeLabel, $this->formatDuration((int) $call->duration_seconds))
                : "{$callTypeLabel} ended",
            default => "{$callTypeLabel} updated",
        };
    }

    private function formatDuration(int $durationSeconds): string
    {
        $minutes = intdiv($durationSeconds, 60);
        $seconds = $durationSeconds % 60;

        if ($minutes > 0) {
            return sprintf('%dm %02ds', $minutes, $seconds);
        }

        return sprintf('%ds', $seconds);
    }
}
